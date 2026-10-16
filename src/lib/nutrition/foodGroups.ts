import type { Category, Ingredient, RecipeItem } from "@/lib/schema/data";

export type FoodGroup = "vegetable" | "fruit" | "protein" | "dairy" | "beanNut" | "grain";

/** 参考《中国居民膳食指南（2022）》每日推荐量（克，可食部）。 */
export const FOOD_GROUPS: Record<FoodGroup, { label: string; min: number; max: number; categories: Category[] }> = {
  vegetable: { label: "蔬菜", min: 300, max: 500, categories: ["vegetable", "leafy"] },
  fruit: { label: "水果", min: 200, max: 350, categories: ["fruit"] },
  protein: { label: "肉禽水产蛋", min: 120, max: 200, categories: ["meat", "seafood", "egg"] },
  dairy: { label: "奶类", min: 300, max: 500, categories: ["dairy"] },
  beanNut: { label: "大豆坚果", min: 25, max: 100, categories: ["bean", "nut"] },
  grain: { label: "谷薯类", min: 200, max: 400, categories: ["grain"] },
};

export const GROUP_KEYS = Object.keys(FOOD_GROUPS) as FoodGroup[];

export function groupOf(category: Category): FoodGroup | null {
  for (const key of GROUP_KEYS) if (FOOD_GROUPS[key].categories.includes(category)) return key;
  return null;
}

export function groupGrams(items: RecipeItem[], ingredients: Map<string, Ingredient>): Record<FoodGroup, number> {
  const totals = Object.fromEntries(GROUP_KEYS.map((k) => [k, 0])) as Record<FoodGroup, number>;
  for (const item of items) {
    const ing = ingredients.get(item.ingredientId);
    const group = ing && groupOf(ing.category);
    if (group) totals[group] += item.grams;
  }
  return totals;
}

/** 每组达成率 0..1：在区间内为 1，不足按比例，超出按超出比例扣分。 */
export function groupAchievement(grams: number, group: FoodGroup): number {
  const { min, max } = FOOD_GROUPS[group];
  if (grams < min) return grams / min;
  if (grams > max) return Math.max(0, 1 - (grams - max) / max);
  return 1;
}

export function dayGroupScore(totals: Record<FoodGroup, number>): number {
  return GROUP_KEYS.reduce((s, k) => s + groupAchievement(totals[k], k), 0) / GROUP_KEYS.length;
}
