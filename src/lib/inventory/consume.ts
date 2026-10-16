import type { Ingredient, InventoryItem, MealEntry } from "@/lib/schema/data";

/** 餐里的克数是可食部，库存记录的是购买毛重。 */
export function grossGrams(grams: number, ing: Ingredient | undefined): number {
  return grams / (ing?.edibleRatio || 1);
}

/** 按到期日从早到晚（FIFO）扣减库存，返回发生变化的库存记录。 */
export function consumeForEntry(inventory: InventoryItem[], entry: MealEntry, ingredients: Map<string, Ingredient>): InventoryItem[] {
  const changed = new Map<string, InventoryItem>();
  for (const item of entry.items) {
    let need = grossGrams(item.grams, ingredients.get(item.ingredientId));
    const stock = inventory
      .filter((i) => i.status === "active" && i.ingredientId === item.ingredientId && i.quantityG > 0)
      .map((i) => changed.get(i.id) ?? i)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
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
