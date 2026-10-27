import type { Ingredient, InventoryItem, MealEntry, Product } from "@/lib/schema/data";
import { inventoryIngredientId } from "./label";

/** 餐里的克数是可食部，库存记录的是购买毛重。 */
export function grossGrams(grams: number, ing: Ingredient | undefined): number {
  return grams / (ing?.edibleRatio || 1);
}

function lotsForLine(
  inventory: InventoryItem[],
  line: MealEntry["items"][number],
  products: Map<string, Product>,
): InventoryItem[] {
  const byProduct = line.productId ? inventory.filter((i) => i.status === "active" && i.quantityG > 0 && i.productId === line.productId) : [];
  if (byProduct.length > 0) return byProduct;
  return inventory.filter((i) => {
    if (i.status !== "active" || i.quantityG <= 0) return false;
    return inventoryIngredientId(i, products) === line.ingredientId;
  });
}

/** 先扣同一件商品，再按食材 FIFO。返回发生变化的库存记录。 */
export function consumeForEntry(
  inventory: InventoryItem[],
  entry: MealEntry,
  ingredients: Map<string, Ingredient>,
  products: Map<string, Product> = new Map(),
): InventoryItem[] {
  const changed = new Map<string, InventoryItem>();
  for (const item of entry.items) {
    let need = grossGrams(item.grams, ingredients.get(item.ingredientId));
    const stock = lotsForLine(
      inventory.map((i) => changed.get(i.id) ?? i),
      item,
      products,
    ).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    for (const s of stock) {
      if (need <= 0) break;
      const take = Math.min(s.quantityG, need);
      need -= take;
      const quantityG = Math.round(s.quantityG - take);
      changed.set(s.id, { ...s, quantityG, status: quantityG <= 0 ? "used" : "active" });
    }
  }
  return [...changed.values()];
}
