"use client";

import { useMemo } from "react";
import { effectiveTripDates } from "@/lib/actions";
import { enumerateDays, weekDays } from "@/lib/dates";
import { useIngredientMap, useTargets } from "@/lib/hooks";
import { MEALS_FOR_COUNT } from "@/lib/nutrition/modes";
import { computeDayBudgets, type DayBudget } from "@/lib/planner/eatOut";
import { dayNutrients } from "@/lib/planner/generate";
import type { MealEntry, Nutrients } from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";

export interface DayView {
  date: string;
  entries: MealEntry[];
  total: Nutrients;
  budget: DayBudget;
  targetKcal: number;
  isTrip: boolean;
}

/** 某一周的展示数据：每天的餐、营养合计、外食预算说明、采购日。 */
export function useWeekView(weekStart: string) {
  const entries = useDataStore((s) => s.data.mealEntries);
  const settings = useDataStore((s) => s.data.settings);
  const shoppingTrips = useDataStore((s) => s.data.shoppingTrips);
  const ing = useIngredientMap();
  const targets = useTargets();

  return useMemo(() => {
    const dates = weekDays(weekStart);
    const meals = MEALS_FOR_COUNT[settings.mealsPerDay];
    const order = new Map(meals.map((m, i) => [m, i]));
    const byId = new Map(entries.map((e) => [e.id, e]));
    const trips = effectiveTripDates({ settings, shoppingTrips }, weekStart);
    const tripSet = new Set(trips);
    const budgets = computeDayBudgets(dates, targets?.kcal ?? 0, settings.mealSplit, meals, byId);
    const days: DayView[] = dates.map((date) => {
      const list = entries.filter((e) => e.date === date).sort((a, b) => (order.get(a.mealType) ?? 9) - (order.get(b.mealType) ?? 9));
      const budget = budgets.get(date)!;
      return {
        date,
        entries: list,
        total: dayNutrients(list, ing),
        budget,
        targetKcal: (targets?.kcal ?? 0) - budget.carryInKcal,
        isTrip: tripSet.has(date),
      };
    });
    return { days, tripDates: trips, hasPlan: days.some((d) => d.entries.length > 0) };
  }, [weekStart, entries, settings, shoppingTrips, ing, targets]);
}

/** 一次采购覆盖的那几天：营养参考 → 随机菜品 → 决定买多少。 */
export function useCycleView(cycleStart: string, cycleEnd: string) {
  const entries = useDataStore((s) => s.data.mealEntries);
  const settings = useDataStore((s) => s.data.settings);
  const shoppingTrips = useDataStore((s) => s.data.shoppingTrips);
  const ing = useIngredientMap();
  const targets = useTargets();

  return useMemo(() => {
    const dates = enumerateDays(cycleStart, cycleEnd);
    const meals = MEALS_FOR_COUNT[settings.mealsPerDay];
    const order = new Map(meals.map((m, i) => [m, i]));
    const byId = new Map(entries.map((e) => [e.id, e]));
    const trips = effectiveTripDates({ settings, shoppingTrips }, cycleStart);
    const tripSet = new Set(trips);
    const budgets = computeDayBudgets(dates, targets?.kcal ?? 0, settings.mealSplit, meals, byId);
    const days: DayView[] = dates.map((date) => {
      const list = entries.filter((e) => e.date === date).sort((a, b) => (order.get(a.mealType) ?? 9) - (order.get(b.mealType) ?? 9));
      const budget = budgets.get(date)!;
      return {
        date,
        entries: list,
        total: dayNutrients(list, ing),
        budget,
        targetKcal: (targets?.kcal ?? 0) - budget.carryInKcal,
        isTrip: tripSet.has(date),
      };
    });
    return {
      days,
      tripDates: trips,
      hasPlan: days.some((d) => d.entries.some((e) => e.recipeId || e.kind !== "home")),
      length: dates.length,
    };
  }, [cycleStart, cycleEnd, entries, settings, shoppingTrips, ing, targets]);
}
