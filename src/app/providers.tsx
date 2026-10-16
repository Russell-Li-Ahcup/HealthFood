"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useDataStore } from "@/lib/store/data-store";
import { ensurePlans } from "@/lib/actions";
import { startSyncScheduler, waitForSyncIdle } from "@/lib/sync";

export function Providers({ children }: { children: React.ReactNode }) {
  const init = useDataStore((s) => s.init);
  const loaded = useDataStore((s) => s.loaded);
  const mode = useDataStore((s) => s.data.profile?.mode ?? "maintain");

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!loaded) return;
    const stop = startSyncScheduler();
    // Pull remote first so a new device doesn't generate plans over synced ones.
    const timer = setTimeout(() => {
      void waitForSyncIdle().then(() => ensurePlans());
    }, 3000);
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [loaded]);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  return <AppShell>{children}</AppShell>;
}
