import type { HealthData } from "@/lib/schema/data";
import type { SyncConfig } from "@/lib/storage/local";
import { connectionError, connectionFetch } from "./connection";
import { etagConflict } from "./errors";
import { assertFileSize, readSyncResponse } from "./limits";
import { withWebDavProxyFallback } from "./proxy-fallback";
import { parseRemoteData, serializeForUpload, type RemoteFile, type SyncAdapter } from "./types";
import { webdavRead, webdavRequest } from "./webdav-request";

function usesProxy(config: SyncConfig): boolean {
  return Boolean(config.webdav?.useProxy);
}

let lastUsedDirectFallback = false;

export function consumeWebDavDirectFallback(): boolean {
  const used = lastUsedDirectFallback;
  lastUsedDirectFallback = false;
  return used;
}

async function transfer<T>(config: SyncConfig, run: (cfg: SyncConfig) => Promise<T>): Promise<T> {
  if (usesProxy(config)) lastUsedDirectFallback = false;
  const { result, usedDirectFallback } = await withWebDavProxyFallback(config, usesProxy, run);
  if (usedDirectFallback) lastUsedDirectFallback = true;
  return result;
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
}

function connection(config: SyncConfig) {
  const dav = config.webdav;
  if (!dav) throw new Error("WebDAV 配置缺失");
  const path = config.remotePath.replace(/^\/+/, "");
  const proxy = usesProxy(config);
  const url = proxy ? `/api/sync/webdav?path=${encodeURIComponent(path)}` : `${dav.endpoint.replace(/\/+$/, "")}/${path}`;
  const headers: Record<string, string> = {};
  if (proxy) {
    headers["X-WebDAV-Endpoint"] = dav.endpoint;
    headers["X-WebDAV-Username"] = encodeURIComponent(dav.username);
    headers["X-WebDAV-Password"] = encodeURIComponent(dav.password);
    headers["X-WebDAV-Encoding"] = "uri";
    headers["X-WebDAV-Auth"] = dav.authType ?? "basic";
  } else if (dav.authType !== "none" && dav.password) {
    headers.Authorization = basicAuth(dav.username, dav.password);
  }
  return { url, headers, proxy };
}

export async function testWebDavConnection(config: SyncConfig): Promise<void> {
  const response = await transfer(config, async (cfg) => {
    const { headers, proxy } = connection(cfg);
    if (proxy) {
      return connectionFetch("/api/sync/webdav", {
        method: "POST",
        headers: { ...headers, Depth: "0" },
        cache: "no-store",
        redirect: "error",
      });
    }
    return webdavRequest(
      `${cfg.webdav!.endpoint.replace(/\/+$/, "")}/`,
      { method: "PROPFIND", headers: { ...headers, Depth: "0" }, cache: "no-store" },
      true,
    );
  });
  if (!response.ok) throw await connectionError(response, "WebDAV");
  if (usesProxy(config) && !lastUsedDirectFallback) {
    if (!(await response.json().catch(() => null))?.ok) {
      throw new Error("应用同步接口响应无效；请确认 Next.js 服务端正在运行");
    }
    return;
  }
  if (response.status !== 207) {
    throw new Error("服务器未返回 WebDAV 目录响应；请检查是否填写了 WebDAV 接口地址，而非网页登录地址");
  }
  await response.body?.cancel();
}

export const webdavAdapter: SyncAdapter = {
  async pull(config): Promise<RemoteFile> {
    const res = await transfer(config, async (cfg) => {
      const { url, headers, proxy } = connection(cfg);
      return proxy ? connectionFetch(url, { headers, cache: "no-store" }) : webdavRead(url, headers, true);
    });
    if (res.status === 404) throw new Error("NOT_FOUND");
    if (!res.ok) throw await connectionError(res, "WebDAV");
    const text = await readSyncResponse(res, config);
    return { data: parseRemoteData(text), etag: res.headers.get("etag") || undefined };
  },

  async push(config, data: HealthData, etag) {
    const body = serializeForUpload(data);
    assertFileSize(config, new TextEncoder().encode(body).byteLength);
    const res = await transfer(config, async (cfg) => {
      const { url, headers, proxy } = connection(cfg);
      headers["Content-Type"] = "application/json";
      if (etag) headers["If-Match"] = etag;
      else if (etag === undefined) headers["If-None-Match"] = "*";
      if (proxy) return connectionFetch(url, { method: "PUT", headers, body });
      let response = await webdavRequest(url, { method: "PUT", headers, body }, true);
      if (response.status === 409) {
        await response.body?.cancel();
        const parts = cfg.remotePath.split("/").filter(Boolean).slice(0, -1);
        let directory = cfg.webdav!.endpoint.replace(/\/+$/, "");
        const auth = connection(cfg).headers;
        for (const part of parts) {
          directory += `/${part}`;
          const mkcol = await webdavRequest(`${directory}/`, { method: "MKCOL", headers: auth, redirect: "error" }, true);
          if (!mkcol.ok && mkcol.status !== 405) throw await connectionError(mkcol, "WebDAV 创建同步目录");
        }
        response = await webdavRequest(url, { method: "PUT", headers, body }, true);
      }
      return response;
    });
    if (res.status === 412) throw etagConflict();
    if (!res.ok) throw await connectionError(res, "WebDAV");
    return res.headers.get("etag") || undefined;
  },
};
