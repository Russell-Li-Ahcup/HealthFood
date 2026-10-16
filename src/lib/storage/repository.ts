import { del, get, set } from "idb-keyval";
import { createEmptyData, parseData, type HealthData } from "@/lib/schema/data";
import { writeDeviceStorage } from "./transfer-guard";

export const DATA_KEY = "healthfood-data";
const DIRTY_KEY = "healthfood-data-dirty";

export async function loadData(): Promise<HealthData> {
  const raw = await get<string>(DATA_KEY);
  if (!raw) return createEmptyData();
  try {
    return parseData(JSON.parse(raw));
  } catch {
    throw new Error("本机数据无法解析，请从云盘同步恢复或导入备份");
  }
}

export async function saveData(data: HealthData, markDirty = true): Promise<void> {
  await writeDeviceStorage(async () => {
    await set(DATA_KEY, JSON.stringify(data));
    if (markDirty) await set(DIRTY_KEY, true);
  });
}

export async function isDataDirty(): Promise<boolean> {
  return Boolean(await get(DIRTY_KEY));
}

export async function markDataClean(): Promise<void> {
  await writeDeviceStorage(() => set(DIRTY_KEY, false));
}

export async function clearAllData(): Promise<void> {
  await writeDeviceStorage(async () => {
    await del(DATA_KEY);
    await del(DIRTY_KEY);
  });
}
