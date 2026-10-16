import { NextRequest, NextResponse } from "next/server";
import { connectionFailureCode } from "@/lib/sync/connection";
import { webdavRead, webdavRequest } from "@/lib/sync/webdav-request";

export const runtime = "nodejs";

function connection(req: NextRequest) {
  const endpoint = req.headers.get("X-WebDAV-Endpoint");
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) throw new Error("请填写有效的 HTTP(S) 服务器地址");
  const decode = (value: string) => (req.headers.get("X-WebDAV-Encoding") === "uri" ? decodeURIComponent(value) : value);
  const username = decode(req.headers.get("X-WebDAV-Username") ?? "");
  const password = decode(req.headers.get("X-WebDAV-Password") ?? "");
  const auth = req.headers.get("X-WebDAV-Auth") ?? "basic";
  if (!["none", "basic"].includes(auth)) throw new Error("不支持的鉴权类型");
  const path = new URL(req.url).searchParams.get("path") ?? "HealthFood/data.json";
  if (path.split("/").some((p) => [".", ".."].includes(decodeURIComponent(p)))) throw new Error("同步路径无效");
  const headers: Record<string, string> = {};
  if (auth !== "none" && password) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  return { base: endpoint.replace(/\/+$/, ""), parts: path.split("/").filter(Boolean), headers };
}

async function handle(req: NextRequest, write: boolean) {
  try {
    const { base, parts, headers } = connection(req);
    const target = `${base}/${parts.join("/")}`;
    let body: string | undefined;
    if (write) {
      headers["Content-Type"] = "application/json";
      for (const key of ["If-Match", "If-None-Match"]) {
        const value = req.headers.get(key);
        if (value) headers[key] = value;
      }
      body = await req.text();
    }
    const authHeaders: Record<string, string> = {};
    if (headers.Authorization) authHeaders.Authorization = headers.Authorization;
    const put = () => webdavRequest(target, { method: "PUT", headers, body, cache: "no-store" });
    let res = write ? await put() : await webdavRead(target, headers);
    if (write && res.status === 409) {
      await res.body?.cancel();
      let directory = base;
      for (const part of parts.slice(0, -1)) {
        directory += `/${part}`;
        const result = await webdavRequest(`${directory}/`, { method: "MKCOL", headers: authHeaders });
        if (!result.ok && result.status !== 405) {
          return NextResponse.json({ error: "创建同步目录失败", stage: "directory" }, { status: result.status });
        }
        await result.body?.cancel();
      }
      res = await put();
    }
    if (!res.ok) {
      await res.body?.cancel();
      return NextResponse.json({ error: `WebDAV 请求失败: ${res.status}`, stage: write ? "upload" : "download" }, { status: res.status });
    }
    return new NextResponse(write ? null : res.body, {
      status: 200,
      headers: { "Content-Type": "application/json", etag: res.headers.get("etag") ?? "", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: "连接失败", code: connectionFailureCode(error) }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req, false);
}

export async function PUT(req: NextRequest) {
  return handle(req, true);
}

// Probe the service root only: no download, MKCOL or PUT.
export async function POST(req: NextRequest) {
  try {
    const { base, headers } = connection(req);
    const response = await webdavRequest(`${base}/`, {
      method: "PROPFIND",
      headers: { ...headers, Depth: "0" },
      cache: "no-store",
      redirect: "error",
    });
    await response.body?.cancel();
    if (response.status !== 207) {
      return NextResponse.json({ error: "WebDAV 目录检查失败" }, { status: response.ok ? 405 : response.status });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "应用服务端无法连接云盘", code: connectionFailureCode(error) }, { status: 502 });
  }
}
