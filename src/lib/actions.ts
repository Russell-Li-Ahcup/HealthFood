"use client";

import { addDaysKey, enumerateDays, todayKey, weekStartOf } from "@/lib/dates";
import { consumeForEntry } from "@/lib/inventory/consume";
import { defaultMealSplit, MODE_CONFIG } from "@/lib/nutrition/modes";
import { scaleItems } from "@/lib/nutrition/recipe";
import { computeTargets } from "@/lib/nutrition/targets";
import { dayNutrients, generateWeek, usableDays } from "@/lib/planner/generate";
import { newSeed } from "@/lib/planner/random";
import type { EatOutLevel } from "@/lib/planner/eatOut";
import { generateId, type HealthData, type MealEntry, type Mode, type Product, type Profile, type ShoppingItem, type ShoppingTrip } from "@/lib/schema/data";
import { reuseProduct } from "@/lib/shopping/catalog";
import { buildTrips, tripId } from "@/lib/shopping/demand";
import { cycleContaining, lastTripOnOrBefore, shoppingDates } from "@/lib/shopping/schedule";
import { removeIn, upsertIn, useDataStore } from "@/lib/store/data-store";

function seedFor(d: HealthData, weekStart: string): number {
  return d.settings.weekSeeds[weekStart] ?? 1;
}

/**
 * 计划采购日 + 已完成的采购日。若最近一次计划采购没有完成（例如刚开始使用），
 * 加一次"今天补充采购"，保证今天到下次采购之间的餐也有食材。
 */
export function effectiveTripDates(
  d: Pick<HealthData, "settings" | "shoppingTrips">,
  weekStart: string,
  today = todayKey(),
): string[] {
  const base = [-7, 0, 7, 14].flatMap((o) => shoppingDates(addDaysKey(weekStart, o), d.settings.shopping));
  const done = d.shoppingTrips.filter((t) => t.status === "done").map((t) => t.date);
  const all = new Set([...base, ...done]);
  const prev = lastTripOnOrBefore(today, base);
  const covered = prev === today || d.shoppingTrips.some((t) => t.status === "done" && (!prev || t.date >= prev) && t.date <= today);
  if (!covered) all.add(today);
  return [...all].sort();
}

function tripDatesFor(d: HealthData, weekStart: string): string[] {
  return effectiveTripDates(d, weekStart);
}

interface PlanOptions {
  weekStart?: string;
  untilDate?: string;
  fromDate?: string;
  reseed?: boolean;
  onlyIds?: Set<string>;
  avoid?: Record<string, string>;
}

export function cycleFromData(d: Pick<HealthData, "settings" | "shoppingTrips">, around = todayKey()) {
  return cycleContaining(effectiveTripDates(d, weekStartOf(around), around), around);
}

/** 按营养目标随机生成「这次采购覆盖的 X 天」菜品，并据此重算采购量。 */
export function planWeekIn(d: HealthData, now: string, opts: PlanOptions = {}): HealthData {
  if (!d.profile) return d;
  const today = todayKey();
  const cycle =
    opts.weekStart && opts.untilDate
      ? { start: opts.weekStart, end: opts.untilDate }
      : opts.weekStart
        ? { start: opts.weekStart, end: addDaysKey(opts.weekStart, 6) }
        : cycleFromData(d, opts.fromDate ?? today);
  let data = d;
  if (opts.reseed) {
    data = { ...data, settings: { ...data.settings, weekSeeds: { ...data.settings.weekSeeds, [cycle.start]: newSeed() }, updatedAt: now } };
  }
  const days = new Set(enumerateDays(cycle.start, cycle.end));
  const prevDays = new Set([addDaysKey(cycle.start, -1), addDaysKey(cycle.start, -2)]);
  const existing = data.mealEntries.filter((e) => days.has(e.date) || prevDays.has(e.date));
  const fromDate = opts.fromDate ?? (cycle.start > today ? cycle.start : today);
  const entries = generateWeek({
    weekStart: cycle.start,
    untilDate: cycle.end,
    fromDate,
    mode: data.profile!.mode,
    daily: computeTargets(data.profile!, data.weightLogs),
    settings: data.settings,
    recipes: data.recipes,
    ingredients: data.ingredients,
    inventory: data.inventory,
    existing,
    tripDates: tripDatesFor(data, weekStartOf(cycle.start)),
    seed: opts.avoid ? newSeed() : seedFor(data, cycle.start),
    now,
    onlyIds: opts.onlyIds,
    avoid: opts.avoid,
  });
  const before = new Map(data.mealEntries.map((e) => [e.id, e]));
  const changed = entries.filter((e) => {
    const prev = before.get(e.id);
    return !prev || JSON.stringify({ ...prev, updatedAt: "" }) !== JSON.stringify({ ...e, updatedAt: "" });
  });
  const keep = new Set(entries.map((e) => e.id));
  const stale = data.mealEntries.filter((e) => days.has(e.date) && e.date >= fromDate && !keep.has(e.id) && !e.eaten).map((e) => e.id);
  data = upsertIn(data, "mealEntries", changed, now);
  if (stale.length > 0 && !opts.onlyIds) data = removeIn(data, "mealEntries", stale, now);
  return syncTripsIn(data, now);
}

/** 重新计算今天之后所有计划中的采购行程。 */
export function syncTripsIn(d: HealthData, now: string): HealthData {
  const today = todayKey();
  const weekStart = weekStartOf(today);
  const dates = [...new Set(tripDatesFor(d, weekStart))].sort();
  const trips = buildTrips({
    tripDates: dates,
    entries: d.mealEntries,
    ingredients: d.ingredients,
    products: d.products,
    inventory: d.inventory,
    existingTrips: d.shoppingTrips,
    today,
    now,
  }).filter((t) => t.status === "done" || t.items.length > 0 || t.date <= addDaysKey(today, 14));
  const ids = new Set(trips.map((t) => t.id));
  const byId = new Map(d.shoppingTrips.map((t) => [t.id, t]));
  const changed = trips.filter((t) => byId.get(t.id) !== t);
  const stale = d.shoppingTrips
    .filter((t) => {
      if (t.status !== "planned") return false;
      if (t.items.some((i) => i.productId)) return false;
      return t.date < today || !ids.has(t.id);
    })
    .map((t) => t.id);
  let data = upsertIn(d, "shoppingTrips", changed, now);
  if (stale.length > 0) data = removeIn(data, "shoppingTrips", stale, now);
  return data;
}

/** 保证有一份可以往里加商品的清单（下次采购日，没有就用今天）。 */
export function ensureOpenTripIn(d: HealthData, now: string): { data: HealthData; trip: ShoppingTrip } {
  const today = todayKey();
  const open = [...d.shoppingTrips]
    .filter((t) => t.status === "planned")
    .sort((a, b) => (a.date >= today && b.date >= today ? a.date.localeCompare(b.date) : a.date >= today ? -1 : b.date >= today ? 1 : b.date.localeCompare(a.date)));
  if (open[0]) return { data: d, trip: open[0] };
  const dates = tripDatesFor(d, weekStartOf(today));
  const date = dates.find((x) => x >= today) ?? today;
  const trip: ShoppingTrip = {
    id: tripId(date),
    date,
    coversFrom: date,
    coversTo: addDaysKey(date, 6),
    status: "planned",
    items: [],
    updatedAt: now,
  };
  return { data: upsertIn(d, "shoppingTrips", [trip], now), trip };
}

function productLine(product: Omit<Product, "updatedAt">, qty = 1, extra: Partial<ShoppingItem> = {}): ShoppingItem {
  const buyQty = Math.max(1, qty);
  const packG = product.packG;
  return {
    ingredientId: product.ingredientId,
    productId: product.id,
    manual: true,
    qtyLocked: true,
    packG,
    needG: extra.needG ?? 0,
    buyQty,
    buyUnit: packG ? "包" : "个",
    buyG: packG ? buyQty * packG : 0,
    estPrice: product.price !== undefined ? buyQty * product.price : undefined,
    checked: false,
    freeze: false,
    ...extra,
  };
}

const store = () => useDataStore.getState();

export async function refreshTrips() {
  await store().update((d, now) => syncTripsIn(d, now));
}

export async function generatePlan(reseed = false, around?: string) {
  await store().update((d, now) => {
    const c = cycleFromData(d, around ?? todayKey());
    const today = todayKey();
    return planWeekIn(d, now, {
      weekStart: c.start,
      untilDate: c.end,
      reseed,
      fromDate: today < c.start ? c.start : today,
    });
  });
}

/** 当前采购周期还没有菜时，按营养随机排出 X 天。 */
export function ensurePlansIn(d: HealthData, now: string): HealthData {
  if (!d.profile || !d.settings.onboarded) return d;
  const c = cycleFromData(d);
  const has = d.mealEntries.some((e) => e.date >= c.start && e.date <= c.end && e.recipeId);
  if (has) return d;
  return planWeekIn(d, now, { weekStart: c.start, untilDate: c.end, fromDate: c.start });
}

export async function ensurePlans() {
  const d = store().data;
  if (ensurePlansIn(d, new Date().toISOString()) === d) return;
  await store().update((cur, now) => ensurePlansIn(cur, now));
}

export async function rerollMeal(entry: MealEntry) {
  await store().update((d, now) =>
    planWeekIn(d, now, {
      ...cycleForEntry(d, entry.date),
      fromDate: entry.date,
      onlyIds: new Set([entry.id]),
      avoid: entry.recipeId ? { [entry.id]: entry.recipeId } : undefined,
    }),
  );
}

export async function setMealRecipe(entry: MealEntry, recipeId: string) {
  await store().update((d, now) => {
    const recipe = d.recipes.find((r) => r.id === recipeId);
    if (!recipe) return d;
    const next: MealEntry = { ...entry, kind: "home", recipeId, scale: 1, items: recipe.items.map((i) => ({ ...i })), locked: true };
    return rebalanceDay(upsertIn(d, "mealEntries", [next], now), now, entry);
  });
}

export async function toggleLock(entry: MealEntry) {
  await store().upsert("mealEntries", { ...entry, locked: !entry.locked });
}

/** 改变餐的类型（在家/外出/跳过）后，重排当天其余未锁定的餐以平衡热量。 */
export async function setMealKind(entry: MealEntry, kind: MealEntry["kind"], eatOut?: { level: EatOutLevel; kcal?: number }) {
  await store().update((d, now) => {
    const next: MealEntry = {
      ...entry,
      kind,
      eatOutLevel: kind === "eat_out" ? eatOut?.level : undefined,
      eatOutKcal: kind === "eat_out" ? eatOut?.kcal : undefined,
      items: kind === "home" ? entry.items : [],
      recipeId: kind === "home" ? entry.recipeId : undefined,
      locked: kind === "home" ? entry.locked : false,
    };
    let data = upsertIn(d, "mealEntries", [next], now);
    if (kind === "home" && !next.recipeId) {
      data = planWeekIn(data, now, { ...cycleForEntry(data, entry.date), fromDate: entry.date, onlyIds: new Set([entry.id]) });
    }
    return rebalanceDay(data, now, entry, kind === "eat_out");
  });
}

/** 重排当天及（外出时）后两天未锁定、未吃的在家餐。 */
function rebalanceDay(d: HealthData, now: string, entry: MealEntry, includeNextDays = false): HealthData {
  const dates = new Set([entry.date, ...(includeNextDays ? [addDaysKey(entry.date, 1), addDaysKey(entry.date, 2)] : [])]);
  const ids = new Set(
    d.mealEntries.filter((e) => dates.has(e.date) && e.id !== entry.id && e.kind === "home" && !e.locked && !e.eaten).map((e) => e.id),
  );
  if (ids.size === 0) return syncTripsIn(d, now);
  return planWeekIn(d, now, { ...cycleForEntry(d, entry.date), fromDate: entry.date, onlyIds: ids });
}

function cycleForEntry(d: HealthData, date: string) {
  const c = cycleContaining(effectiveTripDates(d, weekStartOf(date), date), date);
  return { weekStart: c.start, untilDate: c.end };
}

export async function markEaten(entry: MealEntry, eaten: boolean) {
  await store().update((d, now) => {
    let data = upsertIn(d, "mealEntries", [{ ...entry, eaten }], now);
    if (eaten && entry.kind === "home") {
      const ing = new Map(d.ingredients.map((i) => [i.id, i]));
      const changed = consumeForEntry(d.inventory, entry, ing);
      if (changed.length > 0) data = upsertIn(data, "inventory", changed, now);
    }
    return data;
  });
}

export async function markPastMealsEaten() {
  const today = todayKey();
  const pending = store().data.mealEntries.filter((e) => e.date < today && !e.eaten && e.kind === "home");
  await store().update((d, now) => {
    const ing = new Map(d.ingredients.map((i) => [i.id, i]));
    let data = d;
    for (const e of pending) {
      data = upsertIn(data, "mealEntries", [{ ...e, eaten: true }], now);
      const changed = consumeForEntry(data.inventory, e, ing);
      if (changed.length > 0) data = upsertIn(data, "inventory", changed, now);
    }
    return data;
  });
}

export const itemKey = (i: Pick<ShoppingItem, "ingredientId" | "productId" | "manual">) => `${i.manual ? "m:" : ""}${i.productId ?? i.ingredientId ?? ""}`;

export async function toggleTripItem(tripId: string, key: string) {
  await store().update((d, now) => {
    const trip = d.shoppingTrips.find((t) => t.id === tripId);
    if (!trip) return d;
    const items = trip.items.map((i) => (itemKey(i) === key ? { ...i, checked: !i.checked } : i));
    return upsertIn(d, "shoppingTrips", [{ ...trip, items }], now);
  });
}

export async function saveProduct(product: Omit<Product, "updatedAt">) {
  await store().update((d, now) => upsertIn(d, "products", [product], now));
}

/** 把一件完整商品写进清单。同名会沿用已有档案。没有打开的采购日时会自动建一份。 */
export async function addProductToList(product: Omit<Product, "updatedAt">, targetTripId?: string) {
  await store().update((d, now) => {
    const saved = reuseProduct(d.products, product);
    let data = upsertIn(d, "products", [saved], now);
    const ensured = targetTripId
      ? { data, trip: data.shoppingTrips.find((t) => t.id === targetTripId) }
      : ensureOpenTripIn(data, now);
    const open = ensured.trip;
    if (!open || open.status === "done") return data;
    data = ensured.data;
    const trip = data.shoppingTrips.find((t) => t.id === open.id) ?? open;
    if (trip.items.some((i) => i.productId === saved.id)) return data;
    return upsertIn(data, "shoppingTrips", [{ ...trip, items: [...trip.items, productLine(saved)] }], now);
  });
}

/** 把某一行指定成你实际买的整包商品。 */
export async function assignProduct(targetTripId: string, ingredientId: string, product: Omit<Product, "updatedAt">) {
  await store().update((d, now) => {
    let data = upsertIn(d, "products", [product], now);
    const trip = data.shoppingTrips.find((t) => t.id === targetTripId);
    if (trip && trip.status === "planned") {
      const existing = trip.items.find((i) => i.ingredientId === ingredientId && !i.manual);
      const rest = trip.items.filter((i) => !(i.ingredientId === ingredientId && !i.manual) && i.productId !== product.id);
      const line = productLine(product, existing?.buyQty || 1, { manual: false, qtyLocked: false, needG: existing?.needG ?? 0 });
      data = upsertIn(data, "shoppingTrips", [{ ...trip, items: [...rest, line] }], now);
    }
    return data;
  });
}

export async function setItemFreeze(tripId: string, key: string, freeze: boolean) {
  await store().update((d, now) => {
    const trip = d.shoppingTrips.find((t) => t.id === tripId);
    if (!trip || trip.status === "done") return d;
    const items = trip.items.map((i) => {
      if (itemKey(i) !== key) return i;
      return { ...i, freeze, warning: freeze ? i.warning ?? "冰箱较满，买回后请分装冷冻" : i.warning };
    });
    return upsertIn(d, "shoppingTrips", [{ ...trip, items }], now);
  });
}

export async function setPackCount(tripId: string, key: string, packs: number) {
  await store().update((d, now) => {
    const trip = d.shoppingTrips.find((t) => t.id === tripId);
    if (!trip || trip.status === "done") return d;
    const buyQty = Math.max(0, Math.round(packs));
    const items = trip.items.map((i) => {
      if (itemKey(i) !== key) return i;
      const packG = i.packG ?? d.products.find((p) => p.id === i.productId)?.packG;
      const price = d.products.find((p) => p.id === i.productId)?.price;
      return { ...i, buyQty, packG, buyG: packG ? buyQty * packG : 0, qtyLocked: true, estPrice: price !== undefined ? buyQty * price : undefined };
    });
    return upsertIn(d, "shoppingTrips", [{ ...trip, items }], now);
  });
}

export async function addManualProduct(targetTripId: string, product: Omit<Product, "updatedAt">) {
  await addProductToList(product, targetTripId);
}

export async function removeListItem(targetTripId: string, key: string) {
  await store().update((d, now) => {
    const trip = d.shoppingTrips.find((t) => t.id === targetTripId);
    if (!trip) return d;
    return upsertIn(d, "shoppingTrips", [{ ...trip, items: trip.items.filter((i) => itemKey(i) !== key) }], now);
  });
}

export async function removeManualItem(targetTripId: string, key: string) {
  await removeListItem(targetTripId, key);
}

export async function toggleProductRepeat(productId: string) {
  await store().update((d, now) => {
    const product = d.products.find((p) => p.id === productId);
    if (!product) return d;
    const data = upsertIn(d, "products", [{ ...product, repeat: !product.repeat }], now);
    return syncTripsIn(data, now);
  });
}

/** 从商品档案删除；采购清单里对应行也会拿掉，历史已完成的采购仍保留名称。 */
export async function deleteProduct(productId: string) {
  await store().update((d, now) => {
    let data = removeIn(d, "products", [productId], now);
    const changed = data.shoppingTrips
      .filter((t) => t.status === "planned" && t.items.some((i) => i.productId === productId))
      .map((t) => ({ ...t, items: t.items.filter((i) => i.productId !== productId) }));
    if (changed.length > 0) data = upsertIn(data, "shoppingTrips", changed, now);
    return data;
  });
}

/** 完成采购：按实际购买量写入库存，冷冻的按冷冻保质期计算到期日。 */
export async function completeTrip(tripId: string, items: ShoppingItem[], purchasedAt: string) {
  await store().update((d, now) => {
    const trip = d.shoppingTrips.find((t) => t.id === tripId);
    if (!trip) return d;
    const ing = new Map(d.ingredients.map((i) => [i.id, i]));
    const inventory = items
      .filter((i) => i.buyG > 0 && i.ingredientId && ing.has(i.ingredientId))
      .map((i) => {
        const ingredientId = i.ingredientId as string;
        const ingredient = ing.get(ingredientId)!;
        const days = i.freeze ? usableDays(ingredient) : ingredient.shelfLifeDays;
        return {
          id: generateId(),
          ingredientId,
          quantityG: i.buyG,
          purchasedAt,
          expiresAt: addDaysKey(purchasedAt, days),
          storage: i.freeze ? ("freezer" as const) : ingredient.storage,
          sourceTripId: tripId,
          status: "active" as const,
        };
      });
    const bought: Product[] = [];
    for (const i of items) {
      if (i.buyQty <= 0 || !i.productId) continue;
      const product = d.products.find((p) => p.id === i.productId);
      if (product) bought.push({ ...product, lastBoughtAt: purchasedAt, boughtCount: (product.boughtCount ?? 0) + 1 });
    }
    let data = upsertIn(d, "shoppingTrips", [{ ...trip, items, status: "done" }], now);
    if (bought.length > 0) data = upsertIn(data, "products", bought, now);
    data = upsertIn(data, "inventory", inventory, now);
    return syncTripsIn(data, now);
  });
}

export async function reopenTrip(tripId: string) {
  await store().update((d, now) => {
    const trip = d.shoppingTrips.find((t) => t.id === tripId);
    if (!trip) return d;
    const added = d.inventory.filter((i) => i.sourceTripId === tripId).map((i) => i.id);
    let data = removeIn(d, "inventory", added, now);
    data = upsertIn(data, "shoppingTrips", [{ ...trip, status: "planned" }], now);
    return syncTripsIn(data, now);
  });
}

export async function switchMode(mode: Mode, resetMeals: boolean) {
  await store().update((d, now) => {
    if (!d.profile || d.profile.mode === mode) return d;
    const today = todayKey();
    const weight = [...d.weightLogs].sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg ?? d.profile.weightKg;
    const meals = MODE_CONFIG[mode].defaultMealsPerDay;
    let data: HealthData = {
      ...d,
      profile: {
        ...d.profile,
        mode,
        calorieAdjustKcal: 0,
        modeChangedAt: today,
        lastAdjustCheck: undefined,
        baselineWeightKg: mode === "maintain" ? weight : d.profile.baselineWeightKg,
        updatedAt: now,
      },
      settings: resetMeals
        ? { ...d.settings, mealsPerDay: meals, mealSplit: defaultMealSplit(meals), mealSplitCustomized: false, updatedAt: now }
        : d.settings,
    };
    data = planWeekIn(data, now, { fromDate: today });
    return data;
  });
}

export async function applyCalorieAdjust(next: number | null) {
  await store().update((d, now) => {
    if (!d.profile) return d;
    const profile = { ...d.profile, lastAdjustCheck: todayKey(), updatedAt: now, ...(next !== null ? { calorieAdjustKcal: next } : {}) };
    const data = { ...d, profile };
    return next !== null ? planWeekIn(data, now, { fromDate: todayKey() }) : data;
  });
}

/** 身高体重一变，就把今天及以后没锁定、没吃掉的餐按新目标缩放份量，菜品不变。 */
export function rescaleFutureMeals(d: HealthData, now: string): HealthData {
  if (!d.profile) return d;
  const daily = computeTargets(d.profile, d.weightLogs);
  const ing = new Map(d.ingredients.map((i) => [i.id, i]));
  const recipes = new Map(d.recipes.map((r) => [r.id, r]));
  const today = todayKey();
  const dates = [...new Set(d.mealEntries.filter((e) => e.date >= today).map((e) => e.date))];
  const changed: MealEntry[] = [];
  for (const date of dates) {
    const day = d.mealEntries.filter((e) => e.date === date);
    const open = day.filter((e) => !e.eaten && !e.locked && e.kind === "home" && e.recipeId);
    if (open.length === 0) continue;
    const openIds = new Set(open.map((e) => e.id));
    const fixedKcal = dayNutrients(day.filter((e) => !openIds.has(e.id)), ing).kcal;
    const target = Math.max(0, daily.kcal - fixedKcal);
    const openKcal = dayNutrients(open, ing).kcal;
    if (openKcal < 1 || target <= 0) continue;
    const ratio = target / openKcal;
    if (Math.abs(ratio - 1) < 0.04) continue;
    for (const e of open) {
      const recipe = recipes.get(e.recipeId!);
      if (!recipe) continue;
      const nextScale = Math.min(2, Math.max(0.5, Math.round(e.scale * ratio * 4) / 4));
      if (nextScale === e.scale) continue;
      changed.push({ ...e, scale: nextScale, items: scaleItems(recipe.items, nextScale) });
    }
  }
  const data = changed.length > 0 ? upsertIn(d, "mealEntries", changed, now) : d;
  return syncTripsIn(data, now);
}

/** 身体参数随时改：写入档案（体重同时记到今天），并按新目标调整未吃的餐。 */
export async function applyBody(patch: Partial<Profile>) {
  await store().update((d, now) => {
    if (!d.profile) return d;
    const weightChanged = patch.weightKg !== undefined && patch.weightKg !== d.profile.weightKg;
    let data: HealthData = { ...d, profile: { ...d.profile, ...patch, updatedAt: now } };
    if (weightChanged && patch.weightKg) {
      const date = todayKey();
      data = upsertIn(data, "weightLogs", [{ id: date, date, weightKg: patch.weightKg }], now);
    }
    return rescaleFutureMeals(data, now);
  });
}

export async function logWeight(date: string, weightKg: number) {
  await store().update((d, now) => {
    let data = upsertIn(d, "weightLogs", [{ id: date, date, weightKg }], now);
    if (!data.profile) return data;
    const latest = [...data.weightLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest?.date !== date) return data;
    data = { ...data, profile: { ...data.profile, weightKg, updatedAt: now } };
    return rescaleFutureMeals(data, now);
  });
}

/** 改了餐次/采购设置后，按营养重排当前采购周期里今天起的菜。 */
export async function replanCurrentWeek() {
  await store().update((d, now) => planWeekIn(d, now, { fromDate: todayKey() }));
}
