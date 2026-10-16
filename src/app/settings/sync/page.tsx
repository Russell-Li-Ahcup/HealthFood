"use client";

import { ChevronLeft, CloudUpload, Plug, Unplug } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Field, Input, NumberInput, PageTitle, Segmented } from "@/components/ui";
import {
  buildWebDavSyncConfig,
  clearSyncConfig,
  DEFAULT_REMOTE_PATH,
  getSyncOptions,
  loadSyncConfig,
  saveSyncConfig,
  type SyncConfig,
  type SyncProvider,
} from "@/lib/storage/local";
import { useDataStore } from "@/lib/store/data-store";
import { loadLastSyncSuccess, syncNow, waitForSyncIdle } from "@/lib/sync";
import { testSyncConnection } from "@/lib/sync/connection";

const PRESETS = [
  { name: "坚果云", endpoint: "https://dav.jianguoyun.com/dav/", hint: "用户名为坚果云账号邮箱，密码需在「账户信息 → 安全选项 → 第三方应用管理」中生成应用密码" },
  { name: "Nextcloud", endpoint: "https://你的域名/remote.php/dav/files/用户名/", hint: "使用 Nextcloud 应用密码" },
];

export default function SyncSettingsPage() {
  const status = useDataStore((s) => s.syncStatus);
  const message = useDataStore((s) => s.syncMessage);
  const [loaded, setLoaded] = useState(false);
  const [existing, setExisting] = useState<SyncConfig | null>(null);
  const [provider, setProvider] = useState<SyncProvider>("webdav");
  const [endpoint, setEndpoint] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [useProxy, setUseProxy] = useState(true);
  const [s3, setS3] = useState({ endpoint: "", bucket: "", region: "auto", accessKeyId: "", secretAccessKey: "" });
  const [remotePath, setRemotePath] = useState(DEFAULT_REMOTE_PATH);
  const [interval, setIntervalMin] = useState<number | undefined>(10);
  const [syncOnSave, setSyncOnSave] = useState(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    void loadSyncConfig().then((c) => {
      setExisting(c);
      if (c) {
        setProvider(c.provider);
        setRemotePath(c.remotePath);
        if (c.webdav) {
          setEndpoint(c.webdav.endpoint);
          setUsername(c.webdav.username);
          setPassword(c.webdav.password);
          setUseProxy(c.webdav.useProxy ?? true);
        }
        if (c.s3) setS3(c.s3);
        const o = getSyncOptions(c);
        setIntervalMin(o.intervalMinutes);
        setSyncOnSave(o.syncOnSave);
      }
      setLoaded(true);
    });
    void loadLastSyncSuccess().then(setLast);
  }, [status]);

  const build = (): SyncConfig => {
    const options = { intervalMinutes: interval ?? 10, syncOnSave };
    if (provider === "webdav") {
      const c = buildWebDavSyncConfig(endpoint, username, password, remotePath || DEFAULT_REMOTE_PATH);
      return { ...c, webdav: { ...c.webdav!, useProxy }, options };
    }
    return { provider: "s3", remotePath: remotePath || DEFAULT_REMOTE_PATH, s3: { ...s3, endpoint: s3.endpoint.trim() }, options };
  };

  const valid = provider === "webdav" ? /^https?:\/\//i.test(endpoint.trim()) && username.trim() : /^https?:\/\//i.test(s3.endpoint.trim()) && s3.bucket && s3.accessKeyId && s3.secretAccessKey;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFeedback(null);
    try {
      await fn();
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : "操作失败" });
    } finally {
      setBusy(false);
    }
  };

  const test = () => run(async () => setFeedback({ ok: true, text: await testSyncConnection(build()) }));
  const saveAndSync = () =>
    run(async () => {
      await waitForSyncIdle();
      const config = build();
      await saveSyncConfig(config);
      setExisting(config);
      await syncNow();
      setFeedback({ ok: true, text: "已保存并完成首次同步。另一台设备填写相同配置后即可同步。" });
    });
  const disconnect = () =>
    run(async () => {
      if (!confirm("断开后不再自动同步，本机和云盘上的数据都会保留。确定断开？")) return;
      await waitForSyncIdle();
      await clearSyncConfig();
      setExisting(null);
      setFeedback({ ok: true, text: "已断开云同步。" });
    });

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ChevronLeft size={16} /> 返回设置
      </Link>
      <PageTitle
        title="云同步"
        subtitle="数据保存在本机，同步到你自己的网盘（WebDAV / S3），不经过任何第三方服务器；多台设备的修改会按条目自动合并"
      />

      {existing && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">已连接：{existing.provider === "webdav" ? existing.webdav?.endpoint : `S3 · ${existing.s3?.bucket}`}</div>
              <div className="text-xs text-gray-500">
                {status === "error" ? <span className="text-red-600">{message}</span> : message || (last ? `上次成功同步：${new Date(last).toLocaleString("zh-CN")}` : "尚未同步")}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy || status === "syncing"} onClick={() => run(syncNow)}>
                <CloudUpload size={16} /> 立即同步
              </Button>
              <Button variant="danger" disabled={busy} onClick={disconnect}>
                <Unplug size={16} /> 断开
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="连接配置">
        <Segmented
          value={provider}
          onChange={setProvider}
          options={[
            { value: "webdav", label: "WebDAV（坚果云等）" },
            { value: "s3", label: "S3 兼容存储" },
          ]}
        />
        {provider === "webdav" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {PRESETS.map((p) => (
                <button key={p.name} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200" onClick={() => setEndpoint(p.endpoint)} title={p.hint}>
                  填入{p.name}地址
                </button>
              ))}
            </div>
            <Field label="WebDAV 地址" className="sm:col-span-2" hint={PRESETS[0].hint}>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://dav.jianguoyun.com/dav/" />
            </Field>
            <Field label="用户名">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="密码 / 应用密码">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={useProxy} onChange={(e) => setUseProxy(e.target.checked)} />
              通过应用服务端代理连接（推荐，可避开浏览器跨域限制；代理不可达时自动改为浏览器直连）
            </label>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Endpoint" className="sm:col-span-2" hint="例如 Cloudflare R2：https://<账户ID>.r2.cloudflarestorage.com">
              <Input value={s3.endpoint} onChange={(e) => setS3({ ...s3, endpoint: e.target.value })} />
            </Field>
            <Field label="Bucket">
              <Input value={s3.bucket} onChange={(e) => setS3({ ...s3, bucket: e.target.value })} />
            </Field>
            <Field label="Region">
              <Input value={s3.region} onChange={(e) => setS3({ ...s3, region: e.target.value })} />
            </Field>
            <Field label="Access Key ID">
              <Input value={s3.accessKeyId} onChange={(e) => setS3({ ...s3, accessKeyId: e.target.value })} />
            </Field>
            <Field label="Secret Access Key">
              <Input type="password" value={s3.secretAccessKey} onChange={(e) => setS3({ ...s3, secretAccessKey: e.target.value })} />
            </Field>
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="远程文件路径">
            <Input value={remotePath} onChange={(e) => setRemotePath(e.target.value)} />
          </Field>
          <Field label="自动同步间隔（分钟）" hint="0 = 关闭定时同步">
            <NumberInput value={interval} onChange={setIntervalMin} min={0} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={syncOnSave} onChange={(e) => setSyncOnSave(e.target.checked)} />
            修改后 2 秒自动同步
          </label>
        </div>
        {feedback && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${feedback.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"}`}>{feedback.text}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" disabled={!valid || busy} onClick={test}>
            <Plug size={16} /> 测试连接
          </Button>
          <Button disabled={!valid || busy} onClick={saveAndSync}>
            {busy ? "处理中…" : "保存并同步"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-gray-400">账号密码只保存在本机浏览器中，不会写进同步文件或备份文件。</p>
      </Card>
    </div>
  );
}
