import { diffDays } from "@/lib/dates";
import type { InventoryItem } from "@/lib/schema/data";

export type ExpiryLevel = "expired" | "urgent" | "soon" | "ok";

export function daysLeft(expiresAt: string, today: string): number {
  return diffDays(expiresAt, today);
}

export function expiryLevel(expiresAt: string, today: string): ExpiryLevel {
  const d = daysLeft(expiresAt, today);
  if (d < 0) return "expired";
  if (d <= 1) return "urgent";
  if (d <= 3) return "soon";
  return "ok";
}

export const EXPIRY_STYLE: Record<ExpiryLevel, { label: (d: number) => string; className: string }> = {
  expired: { label: (d) => `已过期 ${-d} 天`, className: "bg-red-100 text-red-700 ring-red-200" },
  urgent: { label: (d) => (d === 0 ? "今天到期" : "明天到期"), className: "bg-orange-100 text-orange-700 ring-orange-200" },
  soon: { label: (d) => `${d} 天后到期`, className: "bg-amber-100 text-amber-700 ring-amber-200" },
  ok: { label: (d) => `还剩 ${d} 天`, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};

export function activeInventory(items: InventoryItem[]): InventoryItem[] {
  return items.filter((i) => i.status === "active" && i.quantityG > 0);
}

export function expiringSoon(items: InventoryItem[], today: string, withinDays = 3): InventoryItem[] {
  return activeInventory(items)
    .filter((i) => daysLeft(i.expiresAt, today) <= withinDays)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}
