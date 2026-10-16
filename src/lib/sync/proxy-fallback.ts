import type { SyncConfig } from "@/lib/storage/local";
import { isKnownNetworkFailureCode } from "./connection";

export function withoutWebDavProxy(config: SyncConfig): SyncConfig {
  if (!config.webdav) return config;
  return { ...config, webdav: { ...config.webdav, useProxy: false } };
}

async function proxyFailureCode(response: Response): Promise<string | undefined> {
  if (response.status !== 502) return undefined;
  const data = await response.clone().json().catch(() => null);
  return typeof data?.code === "string" ? data.code : undefined;
}

function shouldRetryWithoutProxy(error: unknown, proxyCode?: string): boolean {
  if (isKnownNetworkFailureCode(proxyCode)) return true;
  return isKnownNetworkFailureCode((error as { code?: string })?.code);
}

async function runDirect<T>(config: SyncConfig, run: (cfg: SyncConfig) => Promise<T>): Promise<T> {
  try {
    return await run(withoutWebDavProxy(config));
  } catch (fallbackError) {
    const detail = fallbackError instanceof Error ? fallbackError.message : "浏览器直连失败";
    throw new Error(`服务端代理无法访问云盘，浏览器直连也失败：${detail}`);
  }
}

/** When the Next.js proxy cannot reach the cloud, retry with browser-direct WebDAV once. */
export async function withWebDavProxyFallback<T>(
  config: SyncConfig,
  usesProxy: (cfg: SyncConfig) => boolean,
  run: (cfg: SyncConfig) => Promise<T>,
): Promise<{ result: T; usedDirectFallback: boolean }> {
  if (!usesProxy(config)) return { result: await run(config), usedDirectFallback: false };
  try {
    const result = await run(config);
    if (result instanceof Response && shouldRetryWithoutProxy(null, await proxyFailureCode(result))) {
      await result.body?.cancel();
      return { result: await runDirect(config, run), usedDirectFallback: true };
    }
    return { result, usedDirectFallback: false };
  } catch (error) {
    if (!shouldRetryWithoutProxy(error)) throw error;
    return { result: await runDirect(config, run), usedDirectFallback: true };
  }
}
