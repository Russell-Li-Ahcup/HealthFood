"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { startPersistFlush, useDataStore } from "@/lib/store/data-store";

export function Providers({ children }: { children: React.ReactNode }) {
  const init = useDataStore((s) => s.init);
  const loaded = useDataStore((s) => s.loaded);
  const mode = useDataStore((s) => s.data.profile?.mode ?? "maintain");

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (!loaded) return;
    const stopPersist = startPersistFlush();
    let cancelled = false;
    let stopSync = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      const { startSyncScheduler, waitForSyncIdle } = await import("@/lib/sync");
      if (cancelled) return;
      stopSync = startSyncScheduler();
      // Pull remote first so a new device doesn't generate plans over synced ones.
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 3000);
      });
      if (cancelled) return;
      await waitForSyncIdle();
      if (cancelled) return;
      const { ensurePlans } = await import("@/lib/actions");
      await ensurePlans();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopSync();
      stopPersist();
    };
  }, [loaded]);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  return <AppShell>{children}</AppShell>;
}
