import type { SyncConfig } from "@/lib/storage/local";
import { connectionError, connectionFetch } from "./connection";
import { etagConflict } from "./errors";
import { assertFileSize, readSyncResponse } from "./limits";
import { parseRemoteData, serializeForUpload, type SyncAdapter } from "./types";

async function request(config: SyncConfig, action: "pull" | "push", content?: string, etag?: string) {
  const res = await connectionFetch("/api/sync/s3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, config, content, etag }),
  });
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (res.status === 412) throw etagConflict();
  if (!res.ok) throw await connectionError(res, "S3");
  return res;
}

export const s3Adapter: SyncAdapter = {
  async pull(config) {
    const res = await request(config, "pull");
    return { data: parseRemoteData(await readSyncResponse(res, config)), etag: res.headers.get("etag") || undefined };
  },
  async push(config, data, etag) {
    const content = serializeForUpload(data);
    assertFileSize(config, new TextEncoder().encode(content).byteLength);
    const res = await request(config, "push", content, etag);
    return res.headers.get("etag") || undefined;
  },
};
