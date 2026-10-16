// Keep stale stores and background syncs from writing over an import.
// A successful import holds the guard until the page reloads.
let importing = false;
const pendingWrites = new Set<Promise<unknown>>();

export function assertDeviceStorageWritable(): void {
  if (importing) throw new Error("正在导入备份，请等待页面刷新");
}

export function beginDeviceImport(): () => void {
  assertDeviceStorageWritable();
  importing = true;
  return () => {
    importing = false;
  };
}

export async function writeDeviceStorage<T>(write: () => Promise<T>): Promise<T> {
  assertDeviceStorageWritable();
  const pending = write();
  pendingWrites.add(pending);
  try {
    return await pending;
  } finally {
    pendingWrites.delete(pending);
  }
}

export async function waitForDeviceStorageWrites(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
}
