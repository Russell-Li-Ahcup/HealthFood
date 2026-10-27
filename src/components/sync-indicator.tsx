"use client";

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Cloud, CloudOff, Loader2, CloudAlert, CloudCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSyncConfig, SYNC_CONFIG_CHANGED_EVENT } from "@/lib/storage/local";
import { useDataStore } from "@/lib/store/data-store";
import { cn } from "./ui";

const SYNC_SUCCESS_EVENT = "healthfood-sync-success";

export function SyncIndicator() {
  const status = useDataStore((s) => s.syncStatus);
  const message = useDataStore((s) => s.syncMessage);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      void loadSyncConfig().then((c) => setConfigured(Boolean(c)));
      void import("@/lib/sync").then((m) => m.loadLastSyncSuccess()).then(setLast);
    };
    refresh();
    window.addEventListener(SYNC_CONFIG_CHANGED_EVENT, refresh);
    window.addEventListener(SYNC_SUCCESS_EVENT, refresh);
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => {
      window.removeEventListener(SYNC_CONFIG_CHANGED_EVENT, refresh);
      window.removeEventListener(SYNC_SUCCESS_EVENT, refresh);
      clearInterval(timer);
    };
  }, []);

  if (configured === null) return null;
  if (!configured) {
    return (
      <Link href="/settings/sync" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100" title="未配置云同步，数据仅保存在本机">
        <CloudOff size={16} />
        <span className="hidden sm:inline">仅本机</span>
      </Link>
    );
  }
  const lastText = last ? `上次同步 ${formatDistanceToNow(new Date(last), { locale: zhCN, addSuffix: true })}` : "尚未同步";
  const Icon = status === "syncing" ? Loader2 : status === "error" ? CloudAlert : status === "synced" ? CloudCheck : Cloud;
  return (
    <button
      onClick={() => void import("@/lib/sync").then((m) => m.syncNow()).catch(() => {})}
      title={status === "error" ? message : `${message || lastText}（点击立即同步）`}
      className={cn(
        "flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-gray-100",
        status === "error" ? "text-red-500" : status === "synced" ? "text-brand-600" : "text-gray-500",
      )}
    >
      <Icon size={16} className={status === "syncing" ? "animate-spin" : ""} />
      <span className="hidden max-w-48 truncate sm:inline">{status === "error" ? "同步失败" : status === "syncing" ? "同步中…" : lastText}</span>
    </button>
  );
}
