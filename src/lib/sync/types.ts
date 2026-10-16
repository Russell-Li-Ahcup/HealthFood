import { parseData, type HealthData } from "@/lib/schema/data";
import type { SyncConfig } from "@/lib/storage/local";

export interface RemoteFile {
  data: HealthData;
  etag?: string;
}

export interface SyncAdapter {
  pull(config: SyncConfig): Promise<RemoteFile>;
  /** etag: string = If-Match, "" = unconditional, undefined = If-None-Match: * (file must not exist). */
  push(config: SyncConfig, data: HealthData, etag?: string): Promise<string | undefined>;
}

export function parseRemoteData(text: string): HealthData {
  try {
    return parseData(JSON.parse(text));
  } catch {
    throw new Error("云盘上的数据文件格式无效，已停止同步以保护本地数据");
  }
}

export function serializeForUpload(data: HealthData): string {
  return JSON.stringify({ ...data, meta: { updatedAt: data.meta.updatedAt } });
}
