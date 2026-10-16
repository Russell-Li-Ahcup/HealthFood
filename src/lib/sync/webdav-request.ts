import { connectionFetch } from "./connection";

/** Recently written Apache files can have a weak validator until the next second. */
export async function webdavRead(url: string, headers: Record<string, string>, direct = false): Promise<Response> {
  let response = await webdavRequest(url, { method: "GET", headers, cache: "no-store" }, direct);
  for (let retry = 0; retry < 2 && response.ok && response.headers.get("etag")?.startsWith("W/"); retry++) {
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    response = await webdavRequest(url, { method: "GET", headers, cache: "no-store" }, direct);
  }
  return response;
}

/** WebDAV providers may canonicalize paths; never forward credentials to another origin. */
export async function webdavRequest(url: string, init: RequestInit = {}, direct = false): Promise<Response> {
  const origin = new URL(url).origin;
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  // A compressed GET may come back with a weakened ETag that cannot be used in If-Match.
  if (typeof window === "undefined") headers["accept-encoding"] = "identity";
  let target = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await connectionFetch(target, { ...init, headers, redirect: "manual" }, direct);
    if (response.type === "opaqueredirect") throw new Error("浏览器无法读取云盘跳转地址，请开启「通过服务端代理连接」");
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || ![301, 302, 307, 308].includes(response.status) || redirects === 3) {
      throw Object.assign(new Error("云盘跳转无效或次数过多"), { code: "REDIRECT" });
    }
    const next = new URL(location, target);
    if (next.origin !== origin || next.username || next.password) {
      throw Object.assign(new Error("云盘跳转至其他服务地址，已阻止转发凭据"), { code: "REDIRECT" });
    }
    target = next.href;
  }
  throw new Error("云盘跳转失败");
}
