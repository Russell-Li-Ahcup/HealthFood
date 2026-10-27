"use client";

import { parseData, type HealthData } from "@/lib/schema/data";
import { cancelScheduledPersist } from "@/lib/store/data-store";
import { saveData } from "./repository";
import { beginDeviceImport, waitForDeviceStorageWrites } from "./transfer-guard";
import { waitForSyncIdle } from "@/lib/sync";

export function downloadBackup(data: HealthData): void {
  const body = JSON.stringify({ ...data, meta: { updatedAt: data.meta.updatedAt } }, null, 2);
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `healthfood-备份-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Validates, writes and reloads; sync config (credentials) is never part of a backup. */
export async function importBackup(file: File): Promise<void> {
  let data: HealthData;
  try {
    data = parseData(JSON.parse(await file.text()));
  } catch {
    throw new Error("备份文件格式无效");
  }
  await waitForSyncIdle();
  cancelScheduledPersist();
  await waitForDeviceStorageWrites();
  await saveData({ ...data, meta: { updatedAt: new Date().toISOString() } });
  beginDeviceImport();
  window.location.reload();
}
