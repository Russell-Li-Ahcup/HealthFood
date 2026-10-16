import { del, get, set } from "idb-keyval";
import { writeDeviceStorage } from "./transfer-guard";

const SYNC_CONFIG_KEY = "healthfood-sync-config";

export type SyncProvider = "webdav" | "s3";

export const DEFAULT_REMOTE_PATH = "/HealthFood/data.json";
export const SYNC_CONFIG_CHANGED_EVENT = "healthfood-sync-config-changed";

export interface SyncOptions {
  intervalMinutes: number;
  startupDelaySeconds: number;
  syncOnSave: boolean;
  maxFileSizeMB: number;
}

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  intervalMinutes: 10,
  startupDelaySeconds: 1,
  syncOnSave: true,
  maxFileSizeMB: 0,
};

export interface SyncConfig {
  provider: SyncProvider;
  options?: Partial<SyncOptions>;
  remotePath: string;
  webdav?: {
    endpoint: string;
    username: string;
    password: string;
    useProxy?: boolean;
    authType?: "basic" | "none";
  };
  s3?: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export function getSyncOptions(config: SyncConfig): SyncOptions {
  return { ...DEFAULT_SYNC_OPTIONS, ...config.options };
}

export function buildWebDavSyncConfig(endpoint: string, username: string, password: string, remotePath = DEFAULT_REMOTE_PATH): SyncConfig {
  let normalized = endpoint.trim();
  if (normalized && !normalized.endsWith("/")) normalized += "/";
  return {
    provider: "webdav",
    remotePath,
    webdav: { endpoint: normalized, username: username.trim(), password, useProxy: true },
  };
}

export async function loadSyncConfig(): Promise<SyncConfig | null> {
  const raw = await get<string>(SYNC_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncConfig;
  } catch {
    return null;
  }
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await writeDeviceStorage(() => set(SYNC_CONFIG_KEY, JSON.stringify(config)));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_CONFIG_CHANGED_EVENT));
}

export async function clearSyncConfig(): Promise<void> {
  await writeDeviceStorage(() => del(SYNC_CONFIG_KEY));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SYNC_CONFIG_CHANGED_EVENT));
}
