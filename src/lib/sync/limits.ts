import { getSyncOptions, type SyncConfig } from "@/lib/storage/local";

export function assertFileSize(config: SyncConfig, bytes: number): void {
  const limit = getSyncOptions(config).maxFileSizeMB;
  if (limit > 0 && bytes > limit * 1_000_000) {
    throw new Error(`已跳过同步：数据文件超过 ${limit} MB，本地数据已保留`);
  }
}

export async function readSyncResponse(response: Response, config: SyncConfig): Promise<string> {
  assertFileSize(config, Number(response.headers.get("content-length") ?? 0));
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      assertFileSize(config, total);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
