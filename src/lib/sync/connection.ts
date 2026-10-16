import type { SyncConfig } from "@/lib/storage/local";

const networkAdvice: Record<string, string> = {
  EACCES: "连接被运行环境或防火墙拒绝（EACCES）；请允许 Node.js 访问网络",
  EPERM: "运行环境禁止网络连接（EPERM）；请检查应用进程权限和防火墙",
  ENOTFOUND: "域名解析失败（ENOTFOUND）；请核对服务器域名及 DNS 设置",
  EAI_AGAIN: "DNS 暂时无法解析域名（EAI_AGAIN）；请检查网络和 DNS 后重试",
  ECONNREFUSED: "服务器拒绝连接（ECONNREFUSED）；请核对地址、端口及代理是否正在运行",
  ECONNRESET: "连接被中断（ECONNRESET）；请检查代理节点、防火墙或稍后重试",
  UND_ERR_CONNECT_TIMEOUT: "连接服务器超时（UND_ERR_CONNECT_TIMEOUT）；请检查代理分流规则",
  ETIMEDOUT: "连接服务器超时（ETIMEDOUT）；请检查网络、代理分流和防火墙",
  TIMEOUT: "连接超时（15 秒）；请检查网络、服务器地址及代理分流后重试",
  CERT_HAS_EXPIRED: "服务器证书已过期；请联系服务方更新证书并检查本机时间",
  DEPTH_ZERO_SELF_SIGNED_CERT: "服务器使用不受信任的自签名证书；请配置受信任证书",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "无法验证服务器证书链；请检查服务端证书链或本机代理证书配置",
  REDIRECT: "服务地址发生重定向；请填写云盘提供的最终 WebDAV 接口地址",
};

export function isKnownNetworkFailureCode(code: string | undefined | null): boolean {
  return typeof code === "string" && Boolean(networkAdvice[code]);
}

export function connectionFailureCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { code?: string; name?: string; message?: string; cause?: unknown };
  if (value.code && networkAdvice[value.code]) return value.code;
  if (["TimeoutError", "AbortError"].includes(value.name ?? "")) return "TIMEOUT";
  if (value.message === "unexpected redirect") return "REDIRECT";
  return value.cause !== error ? connectionFailureCode(value.cause) : undefined;
}

export function connectionStatusMessage(provider: string, status: number): string {
  const advice: Record<number, string> = {
    400: "请检查服务器地址和连接配置",
    401: "账号或密码验证失败；请核对 WebDAV 用户名与密码（坚果云等服务需使用应用专用密码，而非登录密码）",
    403: "访问被拒绝；请检查账号、密钥及目录/存储桶权限，S3 还需核对区域",
    404: "地址、目录或存储桶不存在；请核对服务地址与路径",
    405: "服务不支持此操作；请确认填写的是 WebDAV / S3 接口地址",
    409: "父目录不存在或路径冲突；请检查远程文件路径",
    429: "请求过于频繁；请稍后重试并调长同步间隔",
    502: "应用服务端无法连接云盘；已尝试改为浏览器直连。若仍失败，请检查网络或代理设置",
    507: "云盘空间不足；请清理空间后重试",
  };
  return `${provider} 连接失败（HTTP ${status}）：${advice[status] ?? (status >= 500 ? "服务暂时不可用；请稍后重试" : "请检查服务地址、连接配置与访问权限")}`;
}

function requestTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function connectionFetch(url: string | URL, init: RequestInit = {}, direct = false): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init.signal ?? requestTimeoutSignal(15_000) });
  } catch (error) {
    const code = connectionFailureCode(error);
    if (code) throw Object.assign(new Error(networkAdvice[code]), { code });
    throw new Error(
      direct
        ? "无法连接云盘；请开启「通过服务端代理连接」以避开浏览器跨域限制，并检查网络及 HTTPS 证书"
        : "无法连接服务；请检查网络、服务器地址及应用服务端是否可访问云盘",
    );
  }
}

export async function connectionError(response: Response, provider: string): Promise<Error> {
  // Translate only allowlisted codes; never display raw server errors or credentials.
  const data = await response.json().catch(() => null);
  if (typeof data?.code === "string" && networkAdvice[data.code]) {
    return Object.assign(new Error(`${provider} 连接失败：${networkAdvice[data.code]}`), { code: data.code });
  }
  return Object.assign(new Error(connectionStatusMessage(provider, response.status)), { status: response.status });
}

export async function testSyncConnection(config: SyncConfig): Promise<string> {
  if (config.provider === "webdav") {
    const { testWebDavConnection } = await import("./webdav");
    await testWebDavConnection(config);
    return "连接成功：WebDAV 服务目录可读取。写入权限会在第一次同步时验证。";
  }
  const response = await connectionFetch("/api/sync/s3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "test", config }),
  });
  if (!response.ok) throw await connectionError(response, "S3");
  if (!(await response.json().catch(() => null))?.ok) throw new Error("应用同步接口响应无效；请确认 Next.js 服务端正在运行");
  return "连接成功：S3 存储桶可访问。读写权限会在第一次同步时验证。";
}
