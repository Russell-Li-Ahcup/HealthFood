import { addDaysKey, diffDays, enumerateDays } from "@/lib/dates";
import { dayGroupScore, groupGrams } from "@/lib/nutrition/foodGroups";
import { MEALS_FOR_COUNT, MODE_CONFIG } from "@/lib/nutrition/modes";
import { itemsGrams, itemsNutrients, scaleItems } from "@/lib/nutrition/recipe";
import { scaleNutrients } from "@/lib/nutrition/targets";
import {
  mealEntryId,
  type Ingredient,
  type InventoryItem,
  type MealEntry,
  type MealType,
  type Mode,
  type Nutrients,
  type Recipe,
  type RecipeItem,
  type Settings,
} from "@/lib/schema/data";
import { lastTripOnOrBefore } from "@/lib/shopping/schedule";
import { computeDayBudgets, eatOutKcal, eatOutNutrients } from "./eatOut";
import { hashString, mulberry32, weightedPick } from "./random";

export interface PlanInput {
  weekStart: string;
  /** 生成区间结束日（含），默认 weekStart 起 7 天。采购周期用「下次采购前一天」。 */
  untilDate?: string;
  /** 只重新生成该日期及之后的餐（之前的保持不变）。 */
  fromDate: string;
  mode: Mode;
  daily: Nutrients;
  settings: Settings;
  recipes: Recipe[];
  ingredients: Ingredient[];
  inventory: InventoryItem[];
  existing: MealEntry[];
  tripDates: string[];
  seed: number;
  now: string;
  /** 只重排这些餐位（换一个）；未提供时重排所有可重排的餐位。 */
  onlyIds?: Set<string>;
  /** 每个餐位要避开的菜谱（换一个时避开当前菜）。 */
  avoid?: Record<string, string>;
}

const PROTEIN_CATS = new Set(["meat", "seafood", "egg", "bean"]);

function recipeMealType(slot: MealType): Recipe["mealTypes"][number] {
  return slot === "snack2" ? "snack" : slot;
}

function mainProtein(items: RecipeItem[], ing: Map<string, Ingredient>): string | null {
  let best: RecipeItem | null = null;
  for (const i of items) {
    const c = ing.get(i.ingredientId)?.category;
    if (c && PROTEIN_CATS.has(c) && (!best || i.grams > best.grams)) best = i;
  }
  return best?.ingredientId ?? null;
}

/** 食材能放到采购后第几天：可冷冻的按冷冻保质期，否则按原保质期。 */
export function usableDays(ing: Ingredient): number {
  if (ing.storage === "freezer") return ing.shelfLifeDays;
  if (ing.freezable && ing.frozenShelfLifeDays) return ing.frozenShelfLifeDays;
  return ing.shelfLifeDays;
}

function isFeasible(recipe: Recipe, date: string, ctx: Ctx): boolean {
  const trip = lastTripOnOrBefore(date, ctx.input.tripDates);
  if (!trip) return true;
  const since = diffDays(date, trip);
  return recipe.items.every((item) => {
    const ing = ctx.ing.get(item.ingredientId);
    if (!ing) return false;
    if (since < usableDays(ing)) return true;
    return ctx.input.inventory.some(
      (inv) => inv.status === "active" && inv.ingredientId === ing.id && inv.quantityG > 0 && inv.expiresAt >= date,
    );
  });
}

interface Ctx {
  input: PlanInput;
  ing: Map<string, Ingredient>;
  rand: () => number;
  /** date -> recipeIds used */
  usedByDate: Map<string, Set<string>>;
  usedIngredients: Set<string>;
  baseNutrients: Map<string, Nutrients>;
}

function scoreCandidate(recipe: Recipe, scale: number, target: Nutrients, date: string, dayItems: RecipeItem[], dayProteins: Set<string>, ctx: Ctx): number {
  const w = MODE_CONFIG[ctx.input.mode].weights;
  const n = scaleNutrients(ctx.baseNutrients.get(recipe.id)!, scale);
  const rel = (a: number, b: number) => (b > 0 ? Math.abs(a - b) / b : 0);
  const macro = -(rel(n.kcal, target.kcal) + rel(n.proteinG, target.proteinG) + rel(n.fatG, target.fatG) + rel(n.carbG, target.carbG)) / 2;

  let variety = 0;
  for (const offset of [1, 2]) {
    if (ctx.usedByDate.get(addDaysKey(date, -offset))?.has(recipe.id)) variety -= offset === 1 ? 1 : 0.6;
  }
  if (ctx.usedByDate.get(date)?.has(recipe.id)) variety -= 1.5;
  const protein = mainProtein(recipe.items, ctx.ing);
  if (protein && dayProteins.has(protein)) variety -= 0.5;

  let expiry = 0;
  for (const item of recipe.items) {
    const soon = ctx.input.inventory.some(
      (inv) => inv.status === "active" && inv.ingredientId === item.ingredientId && inv.quantityG > 0 && inv.expiresAt >= date && diffDays(inv.expiresAt, date) <= 3,
    );
    if (soon) expiry += 0.5;
  }

  const grams = itemsGrams(recipe.items) || 1;
  const density = Math.min(1, ((ctx.baseNutrients.get(recipe.id)!.kcal / grams) * 100) / 200);
  const prefer = MODE_CONFIG[ctx.input.mode].preferTags;
  const tags = recipe.tags.filter((t) => prefer.includes(t)).length;

  let foodGroup = 0;
  if (w.foodGroup > 0) {
    const scaled = scaleItems(recipe.items, scale);
    foodGroup = (dayGroupScore(groupGrams([...dayItems, ...scaled], ctx.ing)) - dayGroupScore(groupGrams(dayItems, ctx.ing))) * 3;
  }
  const fresh = recipe.items.filter((i) => !ctx.usedIngredients.has(i.ingredientId)).length / (recipe.items.length || 1);

  return w.macro * macro + w.variety * variety + w.expiry * expiry + w.density * density + w.tags * tags + w.foodGroup * foodGroup + w.diversity * fresh;
}

function bestScale(recipeKcal: number, targetKcal: number): number {
  if (recipeKcal <= 0) return 1;
  return Math.min(2, Math.max(0.5, Math.round((targetKcal / recipeKcal) * 4) / 4));
}

function entryNutrients(e: MealEntry, ctx: Ctx): Nutrients {
  return itemsNutrients(e.items, ctx.ing);
}

/** 按营养目标随机排出一段日期的菜（默认一周，采购流程里是下次采购前的 X 天）。 */
export function generateWeek(input: PlanInput): MealEntry[] {
  const ing = new Map(input.ingredients.map((i) => [i.id, i]));
  const excluded = new Set(input.settings.dietTags);
  const recipes = input.recipes.filter((r) => r.items.length > 0 && r.items.every((i) => ing.has(i.ingredientId) && !excluded.has(i.ingredientId)));
  const ctx: Ctx = {
    input,
    ing,
    rand: mulberry32(input.seed ^ hashString(input.weekStart)),
    usedByDate: new Map(),
    usedIngredients: new Set(),
    baseNutrients: new Map(recipes.map((r) => [r.id, itemsNutrients(r.items, ing)])),
  };
  const meals = MEALS_FOR_COUNT[input.settings.mealsPerDay];
  const split = input.settings.mealSplit;
  const dates = enumerateDays(input.weekStart, input.untilDate ?? addDaysKey(input.weekStart, 6));
  const existing = new Map(input.existing.map((e) => [e.id, e]));
  const budgets = computeDayBudgets(dates, input.daily.kcal, split, meals, existing);
  const result: MealEntry[] = [];

  for (const e of input.existing) {
    if (e.date < input.weekStart && e.kind === "home" && e.recipeId) {
      if (!ctx.usedByDate.has(e.date)) ctx.usedByDate.set(e.date, new Set());
      ctx.usedByDate.get(e.date)!.add(e.recipeId);
    }
  }

  for (const date of dates) {
    const budget = budgets.get(date)!;
    const dayItems: RecipeItem[] = [];
    const dayProteins = new Set<string>();
    const used = ctx.usedByDate.get(date) ?? new Set<string>();
    ctx.usedByDate.set(date, used);

    const slots = meals.map((m) => {
      const id = mealEntryId(date, m);
      const prev = existing.get(id);
      const regenerable =
        date >= input.fromDate && (!prev || (prev.kind === "home" && !prev.locked && !prev.eaten)) && (!input.onlyIds || input.onlyIds.has(id));
      return { meal: m, id, prev, regenerable };
    });

    // Fixed home meals consume part of the day's home budget first.
    let fixedKcal = 0;
    let regenShare = 0;
    for (const s of slots) {
      if (!s.regenerable && s.prev?.kind === "home") {
        fixedKcal += entryNutrients(s.prev, ctx).kcal;
        s.prev.items.forEach((i) => dayItems.push(i));
        if (s.prev.recipeId) used.add(s.prev.recipeId);
        const p = mainProtein(s.prev.items, ing);
        if (p) dayProteins.add(p);
      } else if (s.regenerable) {
        regenShare += split[s.meal] ?? 0;
      }
    }
    const regenKcal = Math.max(0, budget.homeKcal - fixedKcal);
    const dayRatio = input.daily.kcal > 0 ? regenKcal / input.daily.kcal : 0;

    const dayEntries: MealEntry[] = [];
    for (const s of slots) {
      if (!s.regenerable) {
        if (s.prev) dayEntries.push(s.prev);
        continue;
      }
      const share = regenShare > 0 ? (split[s.meal] ?? 0) / regenShare : 0;
      const target = scaleNutrients(input.daily, dayRatio * share);
      const type = recipeMealType(s.meal);
      let pool = recipes.filter((r) => r.mealTypes.includes(type) && r.id !== input.avoid?.[s.id]);
      const feasible = pool.filter((r) => isFeasible(r, date, ctx));
      if (feasible.length > 0) pool = feasible;
      if (pool.length === 0) {
        dayEntries.push({ id: s.id, date, mealType: s.meal, kind: "home", scale: 1, locked: false, eaten: false, items: [], updatedAt: input.now });
        continue;
      }
      const scored = pool
        .map((r) => {
          const scale = bestScale(ctx.baseNutrients.get(r.id)!.kcal, target.kcal);
          return { item: { recipe: r, scale }, score: scoreCandidate(r, scale, target, date, dayItems, dayProteins, ctx) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      const pick = weightedPick(scored, ctx.rand);
      const items = scaleItems(pick.recipe.items, pick.scale);
      items.forEach((i) => {
        dayItems.push(i);
        ctx.usedIngredients.add(i.ingredientId);
      });
      used.add(pick.recipe.id);
      const p = mainProtein(items, ing);
      if (p) dayProteins.add(p);
      dayEntries.push({
        id: s.id,
        date,
        mealType: s.meal,
        kind: "home",
        recipeId: pick.recipe.id,
        scale: pick.scale,
        locked: false,
        eaten: false,
        items,
        updatedAt: input.now,
      });
    }

    // Day-level correction: nudge the last regenerated meal if the day is off by more than 10%.
    const regenerated = dayEntries.filter((e) => slots.find((s) => s.id === e.id)?.regenerable && e.recipeId);
    if (regenerated.length > 0 && budget.homeKcal > 0) {
      const dayKcal = dayEntries.reduce((s, e) => s + (e.kind === "home" ? entryNutrients(e, ctx).kcal : eatOutKcal(e)), 0);
      const targetDay = budget.homeKcal + budget.eatOutKcal;
      const diff = targetDay - dayKcal;
      if (Math.abs(diff) / targetDay > 0.1) {
        const last = regenerated[regenerated.length - 1];
        const base = ctx.baseNutrients.get(last.recipeId!)!.kcal;
        const scale = Math.min(2, Math.max(0.5, Math.round((last.scale + diff / base) * 4) / 4));
        if (scale !== last.scale) {
          const recipe = recipes.find((r) => r.id === last.recipeId)!;
          last.scale = scale;
          last.items = scaleItems(recipe.items, scale);
        }
      }
    }
    result.push(...dayEntries);
  }
  return result;
}

export function dayNutrients(entries: MealEntry[], ingredients: Map<string, Ingredient>): Nutrients {
  return entries.reduce<Nutrients>(
    (sum, e) => {
      if (e.kind === "skip") return sum;
      const n = e.kind === "eat_out" ? eatOutNutrientsOf(e) : itemsNutrients(e.items, ingredients);
      return {
        kcal: sum.kcal + n.kcal,
        proteinG: sum.proteinG + n.proteinG,
        fatG: sum.fatG + n.fatG,
        carbG: sum.carbG + n.carbG,
        fiberG: sum.fiberG + n.fiberG,
      };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 },
  );
}

function eatOutNutrientsOf(e: MealEntry): Nutrients {
  return eatOutNutrients(eatOutKcal(e));
}
