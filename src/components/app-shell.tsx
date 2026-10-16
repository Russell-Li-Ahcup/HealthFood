"use client";

import { Apple, CalendarDays, Carrot, ChefHat, Home, Package, Settings, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDataStore } from "@/lib/store/data-store";
import { ModeBadge } from "./mode-switch";
import { SyncIndicator } from "./sync-indicator";
import { cn } from "./ui";

const NAV = [
  { href: "/", label: "首页", icon: Home, mobile: true },
  { href: "/plan", label: "饮食计划", icon: CalendarDays, mobile: true },
  { href: "/shopping", label: "采购", icon: ShoppingCart, mobile: true },
  { href: "/inventory", label: "库存", icon: Package, mobile: true },
  { href: "/ingredients", label: "食材库", icon: Carrot },
  { href: "/recipes", label: "菜单", icon: ChefHat },
  { href: "/profile", label: "身体档案", icon: User, mobile: true },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const loaded = useDataStore((s) => s.loaded);
  const loadError = useDataStore((s) => s.loadError);
  const onboarded = useDataStore((s) => Boolean(s.data.profile && s.data.settings.onboarded));
  const isOnboarding = pathname.startsWith("/onboarding");
  const allowWithoutProfile = isOnboarding || pathname.startsWith("/settings/sync");

  useEffect(() => {
    if (loaded && !loadError && !onboarded && !allowWithoutProfile) router.replace("/onboarding");
  }, [loaded, loadError, onboarded, allowWithoutProfile, router]);

  if (!loaded) {
    return <div className="flex min-h-screen items-center justify-center text-gray-400">正在读取本机数据…</div>;
  }
  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow ring-1 ring-red-100">
          <p className="font-semibold text-red-600">数据读取失败</p>
          <p className="mt-2 text-sm text-gray-600">{loadError}</p>
          <p className="mt-2 text-xs text-gray-400">为保护你的数据，应用不会用空数据覆盖本机存储。</p>
        </div>
      </div>
    );
  }
  if (isOnboarding) return <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>;
  if (!onboarded && !allowWithoutProfile) return null;

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-gray-100 bg-white px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-3 text-lg font-bold text-brand-700">
          <Apple size={22} /> HealthFood
        </Link>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                active(n.href) ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50",
              )}
            >
              <n.icon size={18} />
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-gray-100 bg-white/90 px-4 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-700 lg:hidden">
            <Apple size={20} /> HealthFood
          </Link>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <ModeBadge />
            <Link href="/settings" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="设置">
              <Settings size={18} />
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-gray-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.filter((n) => n.mobile).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", active(n.href) ? "text-brand-600" : "text-gray-400")}
          >
            <n.icon size={20} />
            {n.label === "饮食计划" ? "计划" : n.label === "身体档案" ? "我的" : n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
