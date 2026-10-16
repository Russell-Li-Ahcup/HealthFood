import type { Ingredient, Nutrients, RecipeItem } from "@/lib/schema/data";
import { addNutrients, scaleNutrients, ZERO } from "./targets";

export function itemsNutrients(items: RecipeItem[], ingredients: Map<string, Ingredient>): Nutrients {
  let total = ZERO;
  for (const item of items) {
    const ing = ingredients.get(item.ingredientId);
    if (ing) total = addNutrients(total, scaleNutrients(ing.per100g, item.grams / 100));
  }
  return total;
}

export function itemsGrams(items: RecipeItem[]): number {
  return items.reduce((s, i) => s + i.grams, 0);
}

export function scaleItems(items: RecipeItem[], scale: number): RecipeItem[] {
  return items.map((i) => ({ ...i, grams: Math.max(5, Math.round((i.grams * scale) / 5) * 5) }));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
