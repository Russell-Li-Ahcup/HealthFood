import {
  DEFAULT_STORAGE_SPACE,
  FRIDGE_SLOT_LABEL,
  FRIDGE_SLOTS,
  type FridgeSlot,
  type Ingredient,
  type Product,
  type Settings,
  type ShoppingItem,
  type ShoppingTrip,
} from "@/lib/schema/data";

/** 目测档位：满了 / 很少 / 一般 / 较空 / 很空。 */
export const SPACE_LEVELS = [
  { slots: 0, label: "满了" },
  { slots: 2, label: "很少" },
  { slots: 4, label: "一般" },
  { slots: 6, label: "较空" },
  { slots: 10, label: "很空" },
] as const;

const CRISPER = new Set(["vegetable", "leafy", "fruit"]);
const DOOR = new Set(["egg", "condiment", "oil"]);

export function nearestSpaceLevel(slots: number): number {
  let best: number = SPACE_LEVELS[0].slots;
  for (const level of SPACE_LEVELS) {
    if (Math.abs(level.slots - slots) < Math.abs(best - slots)) best = level.slots;
  }
  return best;
}

export function storageSpaceOf(settings: Pick<Settings, "storageSpace"> | undefined): Record<FridgeSlot, number> {
  return { ...DEFAULT_STORAGE_SPACE, ...settings?.storageSpace };
}

/** 1 份 ≈ 400g，没有克数时按件数计。 */
export function spaceUnits(grams: number, qty = 1): number {
  if (grams <= 0) return Math.max(1, qty);
  return Math.max(1, Math.round(grams / 400));
}

export function slotFor(ingredient?: Ingredient, freeze = false): FridgeSlot {
  if (freeze || ingredient?.storage === "freezer") return "freezer";
  if (ingredient?.storage === "room") return "room";
  const cat = ingredient?.category;
  if (cat && CRISPER.has(cat)) return "crisper";
  if (cat && DOOR.has(cat)) return "door";
  return "fridge";
}

export function itemGrams(item: ShoppingItem, product?: Product): number {
  if (item.buyG > 0) return item.buyG;
  const packG = product?.packG ?? item.packG;
  if (packG) return item.buyQty * packG;
  return 0;
}

export interface SlotFit {
  slot: FridgeSlot;
  need: number;
  room: number;
  overflow: number;
}

export interface PlacedItem {
  item: ShoppingItem;
  slot: FridgeSlot;
  units: number;
  suggestFreeze: boolean;
}

export interface TripStorageFit {
  placed: PlacedItem[];
  bySlot: SlotFit[];
  overflow: boolean;
}

export function evaluateTripStorage(
  trip: ShoppingTrip,
  ingredients: Map<string, Ingredient>,
  products: Map<string, Product>,
  space: Record<FridgeSlot, number>,
): TripStorageFit {
  const placed: PlacedItem[] = trip.items.map((item) => {
    const product = item.productId ? products.get(item.productId) : undefined;
    const ingredient = item.ingredientId ? ingredients.get(item.ingredientId) : undefined;
    return {
      item,
      slot: slotFor(ingredient, item.freeze),
      units: spaceUnits(itemGrams(item, product), item.buyQty),
      suggestFreeze: false,
    };
  });

  const need = emptyNeed();
  for (const p of placed) need[p.slot] += p.units;

  const fridgeTight = need.fridge > space.fridge || need.crisper > space.crisper;
  const freezerRoom = space.freezer - need.freezer;
  if (fridgeTight && freezerRoom > 0) {
    for (const p of placed) {
      if (p.item.freeze || (p.slot !== "fridge" && p.slot !== "crisper")) continue;
      const ingredient = p.item.ingredientId ? ingredients.get(p.item.ingredientId) : undefined;
      if (!ingredient?.freezable) continue;
      p.suggestFreeze = true;
    }
  }

  const bySlot: SlotFit[] = FRIDGE_SLOTS.map((slot) => {
    const room = space[slot];
    const used = need[slot];
    return { slot, need: used, room, overflow: Math.max(0, used - room) };
  });

  return { placed, bySlot, overflow: bySlot.some((s) => s.overflow > 0) };
}

export function overflowHint(fit: TripStorageFit): string | undefined {
  const over = fit.bySlot.filter((s) => s.overflow > 0);
  if (over.length === 0) return undefined;
  const names = over.map((s) => `${FRIDGE_SLOT_LABEL[s.slot]}约 ${s.need} 份（估还能放 ${s.room} 份）`).join("、");
  const freeze = fit.placed.some((p) => p.suggestFreeze);
  return `${names}，可能挤不下。${freeze ? "能冻的可以先分装冷冻。" : "建议少买一点或下次再买。"}`;
}

function emptyNeed(): Record<FridgeSlot, number> {
  return { fridge: 0, crisper: 0, door: 0, freezer: 0, room: 0 };
}
