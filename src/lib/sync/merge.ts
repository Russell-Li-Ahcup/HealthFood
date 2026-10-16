import {
  COLLECTIONS,
  type CollectionName,
  type HealthData,
  type ShoppingTrip,
  type Tombstones,
} from "@/lib/schema/data";

export interface MergeStats {
  kept: number;
  merged: number;
  deleted: number;
}

const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const time = (value?: string) => {
  const t = Date.parse(value ?? "");
  return Number.isNaN(t) ? 0 : t;
};

function mergeTombstoneMap(a: Record<string, string>, b: Record<string, string>, cutoff: number): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [id, deletedAt] of [...Object.entries(a), ...Object.entries(b)]) {
    if (time(deletedAt) <= cutoff) continue;
    if (!merged[id] || time(deletedAt) > time(merged[id])) merged[id] = deletedAt;
  }
  return merged;
}

export function mergeTombstones(local: Tombstones, remote: Tombstones, now = Date.now()): Tombstones {
  const cutoff = now - TOMBSTONE_RETENTION_MS;
  return Object.fromEntries(
    COLLECTIONS.map((name) => [name, mergeTombstoneMap(local[name], remote[name], cutoff)]),
  ) as Tombstones;
}

function mergeTrip(winner: ShoppingTrip, other: ShoppingTrip): ShoppingTrip {
  // A checked box on one phone must not be undone by the other device's older copy.
  const checked = new Set(other.items.filter((i) => i.checked).map((i) => i.productId ?? i.ingredientId));
  return { ...winner, items: winner.items.map((i) => (checked.has(i.productId ?? i.ingredientId) ? { ...i, checked: true } : i)) };
}

type Entity = { id: string; updatedAt: string };

function mergeCollection<T extends Entity>(
  name: CollectionName,
  local: T[],
  remote: T[],
  tombstones: Record<string, string>,
  stats: MergeStats,
): T[] {
  const localMap = new Map(local.map((e) => [e.id, e]));
  const remoteMap = new Map(remote.map((e) => [e.id, e]));
  const result: T[] = [];
  for (const id of new Set([...localMap.keys(), ...remoteMap.keys()])) {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const deletedAt = tombstones[id];
    const latest = Math.max(time(l?.updatedAt), time(r?.updatedAt));
    // A record edited after its deletion was recorded survives (re-created on another device).
    if (deletedAt && time(deletedAt) >= latest) {
      stats.deleted++;
      continue;
    }
    if (l && r) {
      const same = JSON.stringify(l) === JSON.stringify(r);
      if (!same) stats.merged++;
      const localNewer = time(l.updatedAt) >= time(r.updatedAt);
      let winner = localNewer ? l : r;
      if (name === "shoppingTrips" && !same) {
        winner = mergeTrip(winner as unknown as ShoppingTrip, (localNewer ? r : l) as unknown as ShoppingTrip) as unknown as T;
      }
      result.push(winner);
    } else {
      result.push((l ?? r)!);
    }
  }
  stats.kept += result.length;
  return result;
}

function newer<T extends { updatedAt: string } | null>(a: T, b: T): T {
  if (!a) return b;
  if (!b) return a;
  return time(a.updatedAt) >= time(b.updatedAt) ? a : b;
}

/** 记录级合并：保留双方新增，传播双方删除（墓碑），同 id 记录按 updatedAt 取新。 */
export function mergeData(local: HealthData, remote: HealthData, now = Date.now()): { data: HealthData; stats: MergeStats } {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones, now);
  const stats: MergeStats = { kept: 0, merged: 0, deleted: 0 };
  const data: HealthData = {
    version: 1,
    meta: { updatedAt: new Date(now).toISOString() },
    profile: newer(local.profile, remote.profile),
    settings: newer(local.settings, remote.settings),
    ingredients: mergeCollection("ingredients", local.ingredients, remote.ingredients, tombstones.ingredients, stats),
    recipes: mergeCollection("recipes", local.recipes, remote.recipes, tombstones.recipes, stats),
    products: mergeCollection("products", local.products, remote.products, tombstones.products, stats),
    mealEntries: mergeCollection("mealEntries", local.mealEntries, remote.mealEntries, tombstones.mealEntries, stats),
    shoppingTrips: mergeCollection("shoppingTrips", local.shoppingTrips, remote.shoppingTrips, tombstones.shoppingTrips, stats),
    inventory: mergeCollection("inventory", local.inventory, remote.inventory, tombstones.inventory, stats),
    weightLogs: mergeCollection("weightLogs", local.weightLogs, remote.weightLogs, tombstones.weightLogs, stats),
    tombstones,
  };
  return { data, stats };
}

export function formatMergeMessage(stats: MergeStats): string {
  const parts = [`保留 ${stats.kept} 条`];
  if (stats.merged > 0) parts.push(`合并 ${stats.merged} 处修改`);
  if (stats.deleted > 0) parts.push(`应用 ${stats.deleted} 条删除`);
  return `已同步：${parts.join("，")}`;
}
