import { describe, expect, it } from "vitest";
import { EPOCH, type Ingredient, type InventoryItem, type MealEntry, type Product } from "@/lib/schema/data";
import { consumeForEntry } from "./consume";

const chicken: Ingredient = {
  id: "chicken",
  updatedAt: EPOCH,
  name: "鸡胸肉",
  category: "meat",
  per100g: { kcal: 133, proteinG: 24, fatG: 2, carbG: 2, fiberG: 0 },
  edibleRatio: 1,
  purchaseUnit: "g",
  unitWeightG: 1,
  minPurchaseG: 0,
  storage: "fridge",
  shelfLifeDays: 2,
  freezable: false,
};

const lidl: Product = { id: "lidl-chicken", name: "Lidl 鸡胸", ingredientId: "chicken", packG: 400, repeat: true, boughtCount: 1, updatedAt: EPOCH };

function lot(partial: Partial<InventoryItem> & Pick<InventoryItem, "id">): InventoryItem {
  return {
    quantityG: 400,
    purchasedAt: "2026-10-16",
    expiresAt: "2026-10-18",
    storage: "fridge",
    status: "active",
    updatedAt: EPOCH,
    ingredientId: "chicken",
    ...partial,
  };
}

function meal(items: MealEntry["items"]): MealEntry {
  return { id: "d_lunch", date: "2026-10-16", mealType: "lunch", kind: "home", scale: 1, locked: false, eaten: true, items, updatedAt: EPOCH };
}

describe("consumeForEntry", () => {
  it("deducts the matching product lot before a generic ingredient lot", () => {
    const products = new Map([[lidl.id, lidl]]);
    const ingredients = new Map([[chicken.id, chicken]]);
    const inventory = [
      lot({ id: "generic", quantityG: 400, expiresAt: "2026-10-17" }),
      lot({ id: "lidl", productId: lidl.id, packG: 400, quantityG: 400, expiresAt: "2026-10-20" }),
    ];
    const changed = consumeForEntry(inventory, meal([{ ingredientId: "chicken", grams: 150, productId: lidl.id }]), ingredients, products);
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe("lidl");
    expect(changed[0].quantityG).toBe(250);
  });

  it("falls back to ingredient lots when the meal has no product", () => {
    const ingredients = new Map([[chicken.id, chicken]]);
    const inventory = [lot({ id: "generic", quantityG: 200 })];
    const changed = consumeForEntry(inventory, meal([{ ingredientId: "chicken", grams: 80 }]), ingredients);
    expect(changed[0].quantityG).toBe(120);
  });
});
