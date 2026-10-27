import { addDaysKey, diffDays } from "@/lib/dates";
import { grossGrams } from "@/lib/inventory/consume";
import { inventoryIngredientId } from "@/lib/inventory/label";
import { usableDays } from "@/lib/planner/generate";
import type { Ingredient, InventoryItem, MealEntry, Product, ShoppingItem, ShoppingTrip } from "@/lib/schema/data";
import { nextTripAfter } from "./schedule";

export const tripId = (date: string) => `trip_${date}`;

/** 一整包不能拆，需要多少就向上取整包。 */
export function packsFor(needG: number, packG: number): number {
  if (packG <= 0) return 1;
  return Math.max(1, Math.ceil(needG / packG));
}

/** 按采购单位向上取整：散装按 50g，按件买的按件数。没有指定商品时才用。 */
export function roundPurchase(grossG: number, ing: Ingredient): Pick<ShoppingItem, "buyQty" | "buyUnit" | "buyG" | "estPrice"> {
  if (ing.purchaseUnit === "g") {
    const buyG = Math.max(ing.minPurchaseG, Math.ceil(grossG / 50) * 50);
    return { buyQty: buyG, buyUnit: "g", buyG, estPrice: ing.pricePerUnit !== undefined ? (buyG / 500) * ing.pricePerUnit : undefined };
  }
  const per = ing.unitWeightG || 1;
  const buyQty = Math.max(1, Math.ceil(Math.max(grossG, ing.minPurchaseG) / per));
  return { buyQty, buyUnit: ing.purchaseUnit, buyG: buyQty * per, estPrice: ing.pricePerUnit !== undefined ? buyQty * ing.pricePerUnit : undefined };
}

export interface NeedLine {
  ingredientId: string;
  needG: number;
  lastUse: string;
}

interface TripInput {
  tripDates: string[];
  entries: MealEntry[];
  ingredients: Ingredient[];
  products: Product[];
  inventory: InventoryItem[];
  existingTrips: ShoppingTrip[];
  today: string;
  now: string;
}

function stockAt(date: string, firstPending: string | undefined, input: TripInput, ing: Map<string, Ingredient>): Map<string, number> {
  const available = new Map<string, number>();
  if (date !== firstPending) return available;
  const products = new Map(input.products.map((p) => [p.id, p]));
  for (const inv of input.inventory) {
    if (inv.status !== "active" || inv.quantityG <= 0 || inv.expiresAt < date) continue;
    const ingredientId = inventoryIngredientId(inv, products);
    if (!ingredientId) continue;
    available.set(ingredientId, (available.get(ingredientId) ?? 0) + inv.quantityG);
  }
  for (const e of input.entries) {
    if (e.kind !== "home" || e.eaten || e.date < input.today || e.date >= date) continue;
    for (const item of e.items) {
      const left = (available.get(item.ingredientId) ?? 0) - grossGrams(item.grams, ing.get(item.ingredientId));
      available.set(item.ingredientId, left);
    }
  }
  return available;
}

function mealNeed(entries: MealEntry[], from: string, to: string, ing: Map<string, Ingredient>): Map<string, NeedLine> {
  const need = new Map<string, NeedLine>();
  for (const e of entries) {
    if (e.kind !== "home" || e.eaten || e.date < from || e.date > to) continue;
    for (const item of e.items) {
      const cur = need.get(item.ingredientId) ?? { ingredientId: item.ingredientId, needG: 0, lastUse: e.date };
      cur.needG += grossGrams(item.grams, ing.get(item.ingredientId));
      if (e.date > cur.lastUse) cur.lastUse = e.date;
      need.set(item.ingredientId, cur);
    }
  }
  return need;
}

function likedProduct(ingredientId: string, products: Product[], prev?: ShoppingItem): Product | undefined {
  if (prev?.productId) {
    const chosen = products.find((p) => p.id === prev.productId);
    if (chosen) return chosen;
  }
  return products
    .filter((p) => p.ingredientId === ingredientId && p.repeat)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function shelfWarning(ingredient: Ingredient, date: string, lastUse: string): { freeze: boolean; warning?: string } {
  const span = diffDays(lastUse, date);
  if (span < ingredient.shelfLifeDays || ingredient.storage === "freezer") return { freeze: false };
  if (ingredient.freezable && span < usableDays(ingredient)) {
    return { freeze: true, warning: `第 ${span + 1} 天才吃完，买回后请分装冷冻` };
  }
  return { freeze: false, warning: `保质期 ${ingredient.shelfLifeDays} 天，第 ${span + 1} 天还要用，建议中途补购` };
}

function lineFromProduct(product: Product, opts: { needG: number; buyQty: number; qtyLocked?: boolean; manual?: boolean; checked: boolean; freeze: boolean; warning?: string }): ShoppingItem {
  const packG = product.packG;
  const buyQty = Math.max(1, opts.buyQty);
  const buyG = packG ? buyQty * packG : 0;
  return {
    ingredientId: product.ingredientId,
    productId: product.id,
    manual: opts.manual,
    qtyLocked: opts.qtyLocked,
    packG,
    needG: Math.round(opts.needG),
    buyQty,
    buyUnit: packG ? "包" : "个",
    buyG,
    estPrice: product.price !== undefined ? buyQty * product.price : undefined,
    checked: opts.checked,
    freeze: opts.freeze,
    warning: opts.warning,
  };
}

/**
 * 采购清单以用户添加的完整商品为准。饮食方案只用来：
 * - 给已有商品补上还差多少、保质期提示
 * - 把你标记过「下次还买」的商品自动放进清单
 * 不会再把食材名直接写成清单行。
 */
export function buildTrips(input: TripInput): ShoppingTrip[] {
  const ing = new Map(input.ingredients.map((i) => [i.id, i]));
  const existing = new Map(input.existingTrips.map((t) => [t.id, t]));
  const upcoming = input.tripDates.filter((d) => d >= input.today).sort();
  const firstPending = upcoming.find((d) => existing.get(tripId(d))?.status !== "done");
  const trips: ShoppingTrip[] = [];

  for (const date of upcoming) {
    const prev = existing.get(tripId(date));
    if (prev?.status === "done") {
      trips.push(prev);
      continue;
    }
    const next = nextTripAfter(date, input.tripDates);
    const coversTo = next ? addDaysKey(next, -1) : addDaysKey(date, 6);
    const need = mealNeed(input.entries, date, coversTo, ing);
    const available = stockAt(date, firstPending, input, ing);
    const checked = new Set(prev?.items.filter((i) => i.checked).map((i) => i.productId ?? i.ingredientId ?? "") ?? []);
    const items: ShoppingItem[] = [];

    for (const earlier of prev?.items ?? []) {
      const product = earlier.productId ? input.products.find((p) => p.id === earlier.productId) : undefined;
      if (!product) continue;
      const ingredientId = product.ingredientId;
      const gross = ingredientId ? (need.get(ingredientId)?.needG ?? 0) : 0;
      const net = gross - Math.max(0, ingredientId ? (available.get(ingredientId) ?? 0) : 0);
      const keep = earlier.manual || earlier.qtyLocked || earlier.checked || !ingredientId || net > 1;
      if (!keep) continue;
      const ingredient = ingredientId ? ing.get(ingredientId) : undefined;
      const lastUse = ingredientId ? need.get(ingredientId)?.lastUse ?? date : date;
      const shelf = ingredient ? shelfWarning(ingredient, date, lastUse) : { freeze: earlier.freeze, warning: earlier.warning };
      const freeze = Boolean(earlier.freeze || shelf.freeze);
      const buyQty = earlier.qtyLocked || earlier.manual ? earlier.buyQty : product.packG && net > 1 ? packsFor(net, product.packG) : Math.max(1, earlier.buyQty);
      items.push(
        lineFromProduct(product, {
          needG: Math.max(0, net),
          buyQty,
          qtyLocked: earlier.qtyLocked,
          manual: earlier.manual,
          checked: checked.has(product.id),
          freeze,
          warning: shelf.warning ?? (earlier.freeze && !shelf.freeze ? "冰箱较满，买回后请分装冷冻" : undefined),
        }),
      );
    }

    for (const [ingredientId, line] of need) {
      if (items.some((i) => i.ingredientId === ingredientId)) continue;
      const net = line.needG - Math.max(0, available.get(ingredientId) ?? 0);
      if (net <= 1) continue;
      const product = likedProduct(ingredientId, input.products);
      if (!product) continue;
      const ingredient = ing.get(ingredientId);
      const shelf = ingredient ? shelfWarning(ingredient, date, line.lastUse) : { freeze: false };
      items.push(
        lineFromProduct(product, {
          needG: net,
          buyQty: product.packG ? packsFor(net, product.packG) : 1,
          checked: checked.has(product.id),
          freeze: shelf.freeze,
          warning: shelf.warning,
        }),
      );
    }

    const trip: ShoppingTrip = { id: tripId(date), date, coversFrom: date, coversTo, status: "planned", items, updatedAt: input.now };
    const same = prev && JSON.stringify({ ...prev, updatedAt: "" }) === JSON.stringify({ ...trip, updatedAt: "" });
    trips.push(same ? prev : trip);
  }
  return trips;
}

/** 方案还缺、但清单里还没有对应商品的食材。 */
export function uncoveredNeeds(trip: ShoppingTrip, entries: MealEntry[], ingredients: Ingredient[], inventory: InventoryItem[], products: Product[], today: string): NeedLine[] {
  const ing = new Map(ingredients.map((i) => [i.id, i]));
  const need = mealNeed(entries, trip.coversFrom, trip.coversTo, ing);
  const available = stockAt(trip.date, trip.date, { tripDates: [trip.date], entries, ingredients, products, inventory, existingTrips: [trip], today, now: "" }, ing);
  const covered = new Set(trip.items.map((i) => i.ingredientId).filter(Boolean));
  const out: NeedLine[] = [];
  for (const [ingredientId, line] of need) {
    if (covered.has(ingredientId)) continue;
    const net = line.needG - Math.max(0, available.get(ingredientId) ?? 0);
    if (net <= 1) continue;
    out.push({ ingredientId, needG: Math.round(net), lastUse: line.lastUse });
  }
  return out.sort((a, b) => b.needG - a.needG);
}

export function tripTotal(trip: ShoppingTrip): number {
  return trip.items.reduce((s, i) => s + (i.estPrice ?? 0), 0);
}
