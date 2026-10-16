import { addDaysKey } from "@/lib/dates";
import type { MealEntry, MealType, Nutrients } from "@/lib/schema/data";

export const EAT_OUT_LEVELS = {
  light: { label: "清淡", kcal: 500, hint: "轻食、沙拉、清汤面" },
  normal: { label: "普通", kcal: 800, hint: "一份盖饭、一碗面" },
  heavy: { label: "大餐", kcal: 1200, hint: "火锅、烧烤、聚餐" },
} as const;
export type EatOutLevel = keyof typeof EAT_OUT_LEVELS | "custom";

/** 外食按 蛋白 15% / 脂肪 40% / 碳水 45% 估算宏量。 */
export function eatOutNutrients(kcal: number): Nutrients {
  return { kcal, proteinG: (kcal * 0.15) / 4, fatG: (kcal * 0.4) / 9, carbG: (kcal * 0.45) / 4, fiberG: kcal / 250 };
}

export function eatOutKcal(entry: Pick<MealEntry, "eatOutLevel" | "eatOutKcal">): number {
  if (entry.eatOutLevel === "custom" || !entry.eatOutLevel) return entry.eatOutKcal ?? EAT_OUT_LEVELS.normal.kcal;
  return EAT_OUT_LEVELS[entry.eatOutLevel].kcal;
}

export interface DayBudget {
  /** 在家吃的所有餐（含锁定的）可用热量。 */
  homeKcal: number;
  eatOutKcal: number;
  /** 由前几天外食超标分摊过来的减量。 */
  carryInKcal: number;
  notes: string[];
}

/**
 * 外出就餐后，当天其余在家的餐分享剩余预算；在家餐至少保留正常份额的 60%，
 * 不够扣的部分按 50% 分摊到后两天，每天最多减当日目标的 10%。
 */
export function computeDayBudgets(
  dates: string[],
  dailyKcal: number,
  split: Record<string, number>,
  meals: MealType[],
  entries: Map<string, MealEntry>,
): Map<string, DayBudget> {
  const total = meals.reduce((s, m) => s + (split[m] ?? 0), 0) || 1;
  const carry = new Map<string, number>();
  const result = new Map<string, DayBudget>();
  for (const date of dates) {
    const notes: string[] = [];
    let eatOut = 0;
    let homeShare = 0;
    for (const m of meals) {
      const e = entries.get(`${date}_${m}`);
      if (e?.kind === "eat_out") eatOut += eatOutKcal(e);
      else if (e?.kind !== "skip") homeShare += (split[m] ?? 0) / total;
    }
    const carryIn = carry.get(date) ?? 0;
    const normalHome = dailyKcal * homeShare;
    let home = dailyKcal - eatOut - carryIn;
    if (eatOut > 0 && homeShare > 0) {
      const minHome = normalHome * 0.6;
      if (home < minHome) {
        const excess = (minHome - home) * 0.5;
        home = minHome;
        const perDay = Math.min(excess / 2, dailyKcal * 0.1);
        for (const offset of [1, 2]) {
          const d = addDaysKey(date, offset);
          carry.set(d, (carry.get(d) ?? 0) + perDay);
        }
        notes.push(`外出就餐热量较高，后两天每天少吃约 ${Math.round(perDay)} 千卡`);
      } else {
        notes.push(`外出就餐约 ${Math.round(eatOut)} 千卡，当天其余餐已减量`);
      }
    }
    if (carryIn > 0) notes.push(`因前几天外食偏多，今天减少约 ${Math.round(carryIn)} 千卡`);
    result.set(date, { homeKcal: Math.max(0, home), eatOutKcal: eatOut, carryInKcal: carryIn, notes });
  }
  return result;
}
