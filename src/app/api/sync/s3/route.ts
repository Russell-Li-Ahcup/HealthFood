import { createHash, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SyncConfig } from "@/lib/storage/local";
import { connectionFailureCode, connectionFetch } from "@/lib/sync/connection";

export const runtime = "nodejs";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
const encode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export async function POST(req: NextRequest) {
  try {
    const { action, config, content, etag } = (await req.json()) as {
      action: string;
      config: SyncConfig;
      content?: string;
      etag?: string;
    };
    const s3 = config.s3;
    if (!s3 || !["pull", "push", "test"].includes(action)) throw new Error("S3 配置或操作无效");
    const url = new URL(s3.endpoint);
    if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash) throw new Error("S3 地址无效");
    const path = [s3.bucket, ...(action === "test" ? [] : config.remotePath.split("/").filter(Boolean))].map(encode).join("/");
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path}`;
    const method = action === "test" ? "HEAD" : action === "pull" ? "GET" : "PUT";
    const body = method === "PUT" ? (content ?? "") : "";
    const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const day = date.slice(0, 8);
    const payloadHash = hash(body);
    const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": date };
    if (method === "PUT") {
      headers["content-type"] = "application/json";
      if (etag) headers["if-match"] = etag;
      else if (etag === undefined) headers["if-none-match"] = "*";
    }
    const keys = Object.keys(headers).sort();
    const signed = keys.join(";");
    const canonical = [method, url.pathname, "", keys.map((k) => `${k}:${headers[k].trim()}\n`).join(""), signed, payloadHash].join("\n");
    const region = s3.region || "us-east-1";
    const scope = `${day}/${region}/s3/aws4_request`;
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${s3.secretAccessKey}`, day), region), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey)
      .update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`)
      .digest("hex");
    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${s3.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
    const res = await connectionFetch(url, {
      method,
      headers,
      body: method === "PUT" ? body : undefined,
      redirect: "error",
      cache: "no-store",
    });
    if (!res.ok) {
      await res.body?.cancel();
      return NextResponse.json({ error: `S3 请求失败: ${res.status}` }, { status: res.status });
    }
    if (action === "test") return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    return new NextResponse(method === "GET" ? res.body : null, {
      headers: { "Content-Type": "application/json", etag: res.headers.get("etag") ?? "", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: "S3 连接失败", code: connectionFailureCode(error) }, { status: 502 });
  }
}
