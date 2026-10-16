import { describe, expect, it } from "vitest";
import { presetIngredients } from "@/data/presets";
import { DEFAULT_STORAGE_SPACE, type Product, type ShoppingItem, type ShoppingTrip } from "@/lib/schema/data";
import { evaluateTripStorage, nearestSpaceLevel, overflowHint, slotFor, spaceUnits } from "./storage";

const now = "2026-10-12T00:00:00.000Z";
const ingredients = new Map(presetIngredients(now).map((i) => [i.id, i]));

const line = (patch: Partial<ShoppingItem> & Pick<ShoppingItem, "needG" | "buyQty" | "buyG">): ShoppingItem => ({
  buyUnit: "包",
  checked: false,
  freeze: false,
  ...patch,
});

const tripOf = (items: ShoppingItem[]): ShoppingTrip => ({
  id: "trip_2026-10-12",
  updatedAt: now,
  date: "2026-10-12",
  coversFrom: "2026-10-12",
  coversTo: "2026-10-18",
  status: "planned",
  items,
});

describe("fridge slot mapping", () => {
  it("puts meat in the fridge, greens in the crisper, eggs on the door", () => {
    expect(slotFor(ingredients.get("p-chicken_breast"))).toBe("fridge");
    expect(slotFor(ingredients.get("p-spinach"))).toBe("crisper");
    expect(slotFor(ingredients.get("p-egg"))).toBe("door");
    expect(slotFor(ingredients.get("p-rice"))).toBe("room");
    expect(slotFor(ingredients.get("p-shrimp"))).toBe("freezer");
  });

  it("sends freezable fridge items to the freezer when marked freeze", () => {
    expect(slotFor(ingredients.get("p-chicken_breast"), true)).toBe("freezer");
  });

  it("keeps room-temperature fruit on the pantry shelf", () => {
    expect(slotFor(ingredients.get("p-banana"))).toBe("room");
    expect(slotFor(ingredients.get("p-apple"))).toBe("crisper");
  });
});

describe("space units", () => {
  it("counts about 400g as one portion", () => {
    expect(spaceUnits(400)).toBe(1);
    expect(spaceUnits(800)).toBe(2);
    expect(spaceUnits(0, 3)).toBe(3);
  });

  it("snaps a custom estimate to the nearest rough level", () => {
    expect(nearestSpaceLevel(5)).toBe(4);
    expect(nearestSpaceLevel(9)).toBe(10);
  });
});

describe("evaluateTripStorage", () => {
  it("warns when the fridge estimate is smaller than the planned portions", () => {
    const product: Product = { id: "ribs", name: "排骨", ingredientId: "p-pork_belly", packG: 400, repeat: true, boughtCount: 0, updatedAt: now };
    const trip = tripOf([
      line({ productId: product.id, ingredientId: product.ingredientId, needG: 800, buyQty: 2, buyG: 800, packG: 400 }),
    ]);
    const fit = evaluateTripStorage(trip, ingredients, new Map([[product.id, product]]), { ...DEFAULT_STORAGE_SPACE, fridge: 0 });
    expect(fit.overflow).toBe(true);
    expect(fit.bySlot.find((s) => s.slot === "fridge")?.need).toBe(2);
    expect(fit.placed[0].suggestFreeze).toBe(true);
  });

  it("does not suggest freezing when the fridge still has room", () => {
    const product: Product = { id: "ribs", name: "排骨", ingredientId: "p-pork_belly", packG: 400, repeat: true, boughtCount: 0, updatedAt: now };
    const trip = tripOf([line({ productId: product.id, ingredientId: product.ingredientId, needG: 400, buyQty: 1, buyG: 400, packG: 400 })]);
    const fit = evaluateTripStorage(trip, ingredients, new Map([[product.id, product]]), DEFAULT_STORAGE_SPACE);
    expect(fit.overflow).toBe(false);
    expect(fit.placed[0].suggestFreeze).toBe(false);
  });

  it("explains overflow in Chinese without asking for a precise count", () => {
    const product: Product = { id: "ribs", name: "排骨", ingredientId: "p-pork_belly", packG: 400, repeat: true, boughtCount: 0, updatedAt: now };
    const trip = tripOf([line({ productId: product.id, ingredientId: product.ingredientId, needG: 800, buyQty: 2, buyG: 800, packG: 400 })]);
    const fit = evaluateTripStorage(trip, ingredients, new Map([[product.id, product]]), { ...DEFAULT_STORAGE_SPACE, fridge: 0 });
    expect(overflowHint(fit)).toMatch(/冷藏层/);
    expect(overflowHint(fit)).toMatch(/分装冷冻/);
  });
});
