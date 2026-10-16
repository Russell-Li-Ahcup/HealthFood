import { describe, expect, it } from "vitest";
import { presetIngredients, presetRecipes } from "@/data/presets";
import { itemsNutrients } from "@/lib/nutrition/recipe";
import { defaultSettings, type MealEntry } from "@/lib/schema/data";
import { buildTrips, packsFor, roundPurchase } from "@/lib/shopping/demand";
import { shoppingCycle, shoppingDates } from "@/lib/shopping/schedule";
import { computeDayBudgets } from "./eatOut";
import { dayNutrients, generateWeek, type PlanInput } from "./generate";

const now = "2026-10-12T00:00:00.000Z";
const ingredients = presetIngredients(now);
const recipes = presetRecipes(now);
const ingMap = new Map(ingredients.map((i) => [i.id, i]));
const daily = { kcal: 2400, proteinG: 110, fatG: 75, carbG: 320, fiberG: 30 };

function input(patch: Partial<PlanInput> = {}): PlanInput {
  const settings = { ...defaultSettings(now), mealsPerDay: 4 as const, mealSplit: { breakfast: 0.25, lunch: 0.3, snack: 0.15, dinner: 0.3 } };
  return {
    weekStart: "2026-10-12",
    fromDate: "2026-10-12",
    mode: "gain",
    daily,
    settings,
    recipes,
    ingredients,
    inventory: [],
    existing: [],
    tripDates: shoppingDates("2026-10-12", settings.shopping),
    seed: 42,
    now,
    ...patch,
  };
}

describe("generateWeek", () => {
  it("fills every slot and stays near the daily target", () => {
    const week = generateWeek(input());
    expect(week).toHaveLength(28);
    expect(week.every((e) => e.recipeId)).toBe(true);
    for (const date of new Set(week.map((e) => e.date))) {
      const kcal = dayNutrients(week.filter((e) => e.date === date), ingMap).kcal;
      expect(Math.abs(kcal - daily.kcal) / daily.kcal).toBeLessThan(0.2);
    }
  });

  it("is reproducible for the same seed and changes with a new seed", () => {
    const a = generateWeek(input()).map((e) => e.recipeId);
    expect(generateWeek(input()).map((e) => e.recipeId)).toEqual(a);
    expect(generateWeek(input({ seed: 7 })).map((e) => e.recipeId)).not.toEqual(a);
  });

  it("keeps locked meals and avoids the current recipe on reroll", () => {
    const week = generateWeek(input());
    const locked: MealEntry = { ...week[1], locked: true };
    const target = week[0];
    const next = generateWeek(input({ existing: [locked, ...week.slice(2)], onlyIds: new Set([target.id]), avoid: { [target.id]: target.recipeId! } }));
    expect(next.find((e) => e.id === locked.id)?.recipeId).toBe(locked.recipeId);
    expect(next.find((e) => e.id === target.id)?.recipeId).not.toBe(target.recipeId);
  });

  it("schedules short-shelf-life leafy greens close to the shopping day", () => {
    // 周一采购，菠菜只能放 3 天：周四及以后不应出现
    const settings = { ...defaultSettings(now), shopping: { mode: "fixed" as const, fixedWeekdays: [1], randomTimesPerWeek: 1 as const, seed: 1, manualDates: [] } };
    const week = generateWeek(input({ settings: { ...settings, mealsPerDay: 3 }, tripDates: ["2026-10-12"] }));
    const late = week.filter((e) => e.date >= "2026-10-15");
    expect(late.some((e) => e.items.some((i) => i.ingredientId === "p-spinach" || i.ingredientId === "p-bean_sprout"))).toBe(false);
  });

  it("only fills days until the next shop", () => {
    const week = generateWeek(input({ untilDate: "2026-10-14" }));
    expect([...new Set(week.map((e) => e.date))]).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(week).toHaveLength(12);
  });

  it("reduces the rest of the day after eating out", () => {
    const week = generateWeek(input());
    const dinner = week.find((e) => e.date === "2026-10-13" && e.mealType === "dinner")!;
    const eatOut: MealEntry = { ...dinner, kind: "eat_out", eatOutLevel: "heavy", items: [], recipeId: undefined };
    const others = week.filter((e) => e.date === "2026-10-13" && e.id !== dinner.id).map((e) => e.id);
    const next = generateWeek(input({ existing: [...week.filter((e) => e.id !== dinner.id), eatOut], onlyIds: new Set(others) }));
    const homeKcal = dayNutrients(next.filter((e) => e.date === "2026-10-13" && e.kind === "home"), ingMap).kcal;
    const beforeKcal = dayNutrients(week.filter((e) => e.date === "2026-10-13" && e.id !== dinner.id), ingMap).kcal;
    expect(homeKcal).toBeLessThan(beforeKcal);
  });
});

describe("eat out budgets", () => {
  it("carries large excess into the next two days", () => {
    const entries = new Map<string, MealEntry>([
      ["2026-10-12_lunch", { id: "2026-10-12_lunch", date: "2026-10-12", mealType: "lunch", kind: "eat_out", eatOutLevel: "custom", eatOutKcal: 2500, scale: 1, locked: false, eaten: false, items: [], updatedAt: now }],
    ]);
    const b = computeDayBudgets(["2026-10-12", "2026-10-13", "2026-10-14"], 2000, { breakfast: 0.3, lunch: 0.4, dinner: 0.3 }, ["breakfast", "lunch", "dinner"], entries);
    expect(b.get("2026-10-12")!.homeKcal).toBeCloseTo(2000 * 0.6 * 0.6);
    expect(b.get("2026-10-13")!.carryInKcal).toBeGreaterThan(0);
    expect(b.get("2026-10-13")!.carryInKcal).toBeLessThanOrEqual(200);
  });
});

describe("shopping", () => {
  it("covers from this shop to the day before the next", () => {
    expect(shoppingCycle(["2026-10-12", "2026-10-16"], "2026-10-12")).toEqual({ start: "2026-10-12", end: "2026-10-15", length: 4 });
  });

  it("buys whole packs and never splits a product", () => {
    expect(packsFor(400, 400)).toBe(1);
    expect(packsFor(401, 400)).toBe(2);
    expect(packsFor(50, 400)).toBe(1);
  });

  it("uses the liked product as a whole pack", () => {
    const week = generateWeek(input());
    const counts = new Map<string, number>();
    for (const e of week) for (const i of e.items) counts.set(i.ingredientId, (counts.get(i.ingredientId) ?? 0) + i.grams);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const product = { id: "lidl-ribs", name: "Lidl 排骨", ingredientId: top, packG: 400, price: 4.5, repeat: true, boughtCount: 0, updatedAt: now };
    const trips = buildTrips({
      tripDates: ["2026-10-12"],
      entries: week,
      ingredients,
      products: [product],
      inventory: [],
      existingTrips: [],
      today: "2026-10-12",
      now,
    });
    const line = trips[0].items.find((i) => i.productId === "lidl-ribs");
    expect(line).toBeTruthy();
    expect(line!.buyG).toBe(line!.buyQty * 400);
    expect(line!.buyQty).toBeGreaterThanOrEqual(1);
  });

  it("keeps a product the user added even if the meal plan does not need it", () => {
    const product = { id: "x", name: "Lidl Spare Ribs", packG: 400, repeat: false, boughtCount: 0, updatedAt: now };
    const trips = buildTrips({
      tripDates: ["2026-10-12"],
      entries: [],
      ingredients,
      products: [product],
      inventory: [],
      existingTrips: [
        {
          id: "trip_2026-10-12",
          date: "2026-10-12",
          coversFrom: "2026-10-12",
          coversTo: "2026-10-18",
          status: "planned",
          items: [{ productId: "x", needG: 0, buyQty: 1, buyUnit: "包", buyG: 400, packG: 400, manual: true, checked: false, freeze: false }],
          updatedAt: now,
        },
      ],
      today: "2026-10-12",
      now,
    });
    expect(trips[0].items.map((i) => i.productId)).toEqual(["x"]);
  });

  it("rounds purchases to units", () => {
    expect(roundPurchase(130, ingMap.get("p-egg")!)).toMatchObject({ buyQty: 3, buyUnit: "个" });
    expect(roundPurchase(120, ingMap.get("p-chicken_breast")!)).toMatchObject({ buyG: 250 });
    expect(roundPurchase(420, ingMap.get("p-chicken_breast")!)).toMatchObject({ buyG: 450 });
  });

  it("builds a trip covering meals until the next trip and subtracts inventory", () => {
    const week = generateWeek(input());
    const trips = buildTrips({ tripDates: ["2026-10-12", "2026-10-15"], entries: week, ingredients, products: [], inventory: [], existingTrips: [], today: "2026-10-12", now });
    expect(trips).toHaveLength(2);
    expect(trips[0].coversTo).toBe("2026-10-14");
    expect(trips[0].items).toEqual([]);
    const riceProduct = { id: "bag-rice", name: "大米 5kg", ingredientId: "p-rice", packG: 5000, repeat: true, boughtCount: 0, updatedAt: now };
    const withNeed = buildTrips({
      tripDates: ["2026-10-12", "2026-10-15"],
      entries: week,
      ingredients,
      products: [riceProduct],
      inventory: [],
      existingTrips: [],
      today: "2026-10-12",
      now,
    });
    expect(withNeed[0].items.some((i) => i.productId === "bag-rice")).toBe(true);
    const withStock = buildTrips({
      tripDates: ["2026-10-12", "2026-10-15"],
      entries: week,
      ingredients,
      products: [riceProduct],
      inventory: [{ id: "x", ingredientId: "p-rice", quantityG: 5000, purchasedAt: "2026-10-01", expiresAt: "2027-03-01", storage: "room", status: "active", updatedAt: now }],
      existingTrips: [],
      today: "2026-10-12",
      now,
    });
    expect(withStock[0].items.find((i) => i.productId === "bag-rice")).toBeUndefined();
  });

  it("recipe nutrients are sane", () => {
    for (const r of recipes) expect(itemsNutrients(r.items, ingMap).kcal).toBeGreaterThan(100);
  });
});
