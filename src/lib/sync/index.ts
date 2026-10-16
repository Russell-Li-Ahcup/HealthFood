"use client";

import { get, set } from "idb-keyval";
import { getSyncOptions, loadSyncConfig, SYNC_CONFIG_CHANGED_EVENT, type SyncConfig } from "@/lib/storage/local";
import { markDataClean, saveData } from "@/lib/storage/repository";
import { assertDeviceStorageWritable, writeDeviceStorage } from "@/lib/storage/transfer-guard";
import { useDataStore } from "@/lib/store/data-store";
import { isEtagConflict } from "./errors";
import { formatMergeMessage, mergeData, type MergeStats } from "./merge";
import { s3Adapter } from "./s3";
import type { RemoteFile } from "./types";
import { consumeWebDavDirectFallback, webdavAdapter } from "./webdav";

export const SYNC_SUCCESS_EVENT = "healthfood-sync-success";
const SUCCESS_KEY = "healthfood-sync-last-success";
const ETAG_CONFLICT_MESSAGE = "云盘拒绝了文件版本校验，已自动重试一次但仍未通过；可能是另一台设备正在同步，本次同步未完成。";

export async function loadLastSyncSuccess(): Promise<string | null> {
  return (await get<string>(SUCCESS_KEY)) ?? null;
}

let inFlight: Promise<void> | null = null;
let applyingRemote = false;

function adapterFor(config: SyncConfig) {
  if (config.provider === "webdav") return webdavAdapter;
  if (config.provider === "s3") return s3Adapter;
  throw new Error("不支持的远程服务");
}

async function runSync(): Promise<void> {
  const store = useDataStore.getState();
  try {
    const config = await loadSyncConfig();
    if (!config) throw new Error("未配置云同步");
    if (!store.loaded || store.loadError) throw new Error("本地数据尚未正确加载，请稍后重试");
    const adapter = adapterFor(config);
    store.setSyncStatus("syncing", "正在同步…");
    for (let attempt = 0; attempt < 2; attempt++) {
      const local = useDataStore.getState().data;
      let remote: RemoteFile | undefined;
      try {
        remote = await adapter.pull(config);
      } catch (error) {
        if (!(error instanceof Error && error.message === "NOT_FOUND")) throw error;
      }
      let merged = local;
      let stats: MergeStats | undefined;
      if (remote) ({ data: merged, stats } = mergeData(local, remote.data));
      let etag: string | undefined;
      try {
        assertDeviceStorageWritable();
        etag = await adapter.push(config, merged, remote ? (remote.etag ?? "") : undefined);
      } catch (error) {
        if (attempt === 0 && isEtagConflict(error)) continue;
        throw error;
      }
      if (JSON.stringify(await loadSyncConfig()) !== JSON.stringify(config)) {
        store.setSyncStatus("idle", "配置已改变，请重新同步");
        return;
      }
      const result = { ...merged, meta: { ...merged.meta, etag } };
      if (useDataStore.getState().data === local) {
        applyingRemote = true;
        try {
          await saveData(result, false);
          await useDataStore.getState().setData(result, false);
          await markDataClean();
        } finally {
          applyingRemote = false;
        }
      } else {
        // The user edited during the upload: keep those edits; the next sync merges them.
        const current = useDataStore.getState().data;
        const { data: rebased } = mergeData(current, result);
        applyingRemote = true;
        try {
          await useDataStore.getState().setData(rebased, true);
        } finally {
          applyingRemote = false;
        }
      }
      await writeDeviceStorage(() => set(SUCCESS_KEY, new Date().toISOString()));
      window.dispatchEvent(new Event(SYNC_SUCCESS_EVENT));
      const fallbackNote = consumeWebDavDirectFallback() ? "（服务端代理不可达，已通过浏览器直连云盘）" : "";
      store.setSyncStatus("synced", `${stats ? formatMergeMessage(stats) : "已上传到云盘"}${fallbackNote}`);
      return;
    }
  } catch (error) {
    const detail = error instanceof Error && error.message !== "ETAG_CONFLICT" ? `具体原因：${error.message}` : "";
    const message = isEtagConflict(error)
      ? [ETAG_CONFLICT_MESSAGE, detail].filter(Boolean).join(" ")
      : error instanceof Error
        ? error.message
        : "同步失败";
    store.setSyncStatus("error", message);
    throw new Error(message);
  }
}

export function syncNow(): Promise<void> {
  try {
    assertDeviceStorageWritable();
  } catch (error) {
    return Promise.reject(error);
  }
  if (!inFlight) inFlight = runSync().finally(() => (inFlight = null));
  return inFlight;
}

/** Let an already-started request finish before replacing local configuration. */
export async function waitForSyncIdle(): Promise<void> {
  await inFlight?.catch(() => {});
}

export function startSyncScheduler(): () => void {
  let stopped = false;
  let revision = 0;
  let interval: ReturnType<typeof setInterval> | undefined;
  let startup: ReturnType<typeof setTimeout> | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let config: SyncConfig | null = null;
  const run = () => {
    if (!stopped && navigator.onLine) void syncNow().catch(() => {});
  };
  const refresh = async (initial = false) => {
    const current = ++revision;
    clearInterval(interval);
    clearTimeout(debounce);
    const loaded = await loadSyncConfig();
    if (stopped || current !== revision) return;
    config = loaded;
    if (!config) {
      clearTimeout(startup);
      useDataStore.getState().setSyncStatus("idle", "");
      return;
    }
    const options = getSyncOptions(config);
    if (options.intervalMinutes > 0) interval = setInterval(run, options.intervalMinutes * 60_000);
    if (initial && options.startupDelaySeconds >= 0) startup = setTimeout(run, options.startupDelaySeconds * 1000);
  };
  const changed = () => void refresh().catch(() => {});
  const unsubscribe = useDataStore.subscribe((state, previous) => {
    if (!state.loaded || state.data === previous.data || applyingRemote || !config || !getSyncOptions(config).syncOnSave) return;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      if (inFlight) await inFlight.catch(() => {});
      if (!stopped && config && getSyncOptions(config).syncOnSave) run();
    }, 2000);
  });
  window.addEventListener(SYNC_CONFIG_CHANGED_EVENT, changed);
  window.addEventListener("online", run);
  void refresh(true).catch(() => {});
  return () => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(startup);
    clearTimeout(debounce);
    unsubscribe();
    window.removeEventListener(SYNC_CONFIG_CHANGED_EVENT, changed);
    window.removeEventListener("online", run);
  };
}
