"use client";

import { create } from "zustand";
import {
  createEmptyData,
  EPOCH,
  touchData,
  type CollectionName,
  type HealthData,
  type Profile,
  type Settings,
} from "@/lib/schema/data";
import { loadData, saveData } from "@/lib/storage/repository";
import { seedPresets } from "@/data/presets";

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

type EntityOf<C extends CollectionName> = HealthData[C][number];
type NewEntity<C extends CollectionName> = Omit<EntityOf<C>, "updatedAt"> & { updatedAt?: string };

interface DataState {
  data: HealthData;
  loaded: boolean;
  loadError: string | null;
  syncStatus: SyncStatus;
  syncMessage: string;

  init: () => Promise<void>;
  /** Replace the whole document (used by sync and backup import). */
  setData: (data: HealthData, persist?: boolean) => Promise<void>;
  /** Apply an arbitrary transformation; the result is touched and persisted. */
  update: (fn: (data: HealthData, now: string) => HealthData) => Promise<void>;
  upsert: <C extends CollectionName>(collection: C, items: NewEntity<C> | NewEntity<C>[]) => Promise<void>;
  remove: <C extends CollectionName>(collection: C, ids: string | string[]) => Promise<void>;
  setProfile: (patch: Partial<Profile>) => Promise<void>;
  setSettings: (patch: Partial<Settings>) => Promise<void>;
  setSyncStatus: (status: SyncStatus, message?: string) => void;
}

function timeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Pure helpers so domain code can compose several changes into one persisted update. */
export function upsertIn<C extends CollectionName>(data: HealthData, collection: C, items: NewEntity<C>[], now: string): HealthData {
  const list = data[collection] as EntityOf<C>[];
  const byId = new Map(list.map((e) => [e.id, e]));
  for (const item of items) byId.set(item.id, { ...item, updatedAt: now } as EntityOf<C>);
  const tombstones = { ...data.tombstones, [collection]: { ...data.tombstones[collection] } };
  for (const item of items) delete tombstones[collection][item.id];
  return { ...data, [collection]: [...byId.values()], tombstones };
}

export function removeIn(data: HealthData, collection: CollectionName, ids: string[], now: string): HealthData {
  const remove = new Set(ids);
  const list = (data[collection] as { id: string }[]).filter((e) => !remove.has(e.id));
  const map = { ...data.tombstones[collection] };
  for (const id of ids) map[id] = now;
  return { ...data, [collection]: list, tombstones: { ...data.tombstones, [collection]: map } };
}

export const useDataStore = create<DataState>((set, get) => ({
  data: createEmptyData(),
  loaded: false,
  loadError: null,
  syncStatus: "idle",
  syncMessage: "",

  init: async () => {
    if (get().loaded) return;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let data = await timeout(loadData(), 12_000, "本地数据读取超时");
        if (data.ingredients.length === 0 && data.recipes.length === 0) {
          data = touchData(seedPresets(data, EPOCH));
          await saveData(data);
        }
        set({ data, loaded: true, loadError: null });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    const message = lastError instanceof Error ? lastError.message : "无法读取本机数据";
    // Never overwrite local storage with an empty document after a failed read.
    set({ loaded: true, loadError: `${message}；请刷新页面` });
  },

  setData: async (data, persist = true) => {
    if (persist) await saveData(data);
    set({ data });
  },

  update: async (fn) => {
    if (get().loadError) throw new Error("本地数据未正确加载，已禁止写入");
    const now = new Date().toISOString();
    const next = touchData(fn(get().data, now));
    set({ data: next });
    await saveData(next);
  },

  upsert: async (collection, items) => {
    const list = Array.isArray(items) ? items : [items];
    await get().update((d, now) => upsertIn(d, collection, list, now));
  },

  remove: async (collection, ids) => {
    const list = Array.isArray(ids) ? ids : [ids];
    await get().update((d, now) => removeIn(d, collection, list, now));
  },

  setProfile: async (patch) => {
    await get().update((d, now) => {
      if (!d.profile && !isCompleteProfile(patch)) throw new Error("身体档案不完整");
      return { ...d, profile: { ...(d.profile as Profile), ...patch, updatedAt: now } };
    });
  },

  setSettings: async (patch) => {
    await get().update((d, now) => ({ ...d, settings: { ...d.settings, ...patch, updatedAt: now } }));
  },

  setSyncStatus: (status, message = "") => set({ syncStatus: status, syncMessage: message }),
}));

function isCompleteProfile(p: Partial<Profile>): p is Profile {
  return Boolean(p.gender && p.birthDate && p.heightCm && p.weightKg && p.activityLevel && p.mode);
}
