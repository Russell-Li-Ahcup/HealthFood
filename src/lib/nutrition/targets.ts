import { differenceInYears, parseISO } from "date-fns";
import type { MealType, Nutrients, Profile, WeightLog } from "@/lib/schema/data";
import { MODE_CONFIG } from "./modes";

export const ACTIVITY_LEVELS = [
  { level: 1, factor: 1.2, label: "久坐", hint: "办公室工作，几乎不运动" },
  { level: 2, factor: 1.375, label: "轻度活动", hint: "每周运动 1–3 次" },
  { level: 3, factor: 1.55, label: "中度活动", hint: "每周运动 3–5 次" },
  { level: 4, factor: 1.725, label: "高强度", hint: "每周运动 6–7 次" },
  { level: 5, factor: 1.9, label: "极高强度", hint: "体力劳动或每天训练两次" },
] as const;

export interface BmiInfo {
  bmi: number;
  level: "under" | "normal" | "over" | "obese";
  label: string;
  healthyMinKg: number;
  healthyMaxKg: number;
}

/** 中国成人 BMI 标准。 */
export function bmiInfo(weightKg: number, heightCm: number): BmiInfo {
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  const level = bmi < 18.5 ? "under" : bmi < 24 ? "normal" : bmi < 28 ? "over" : "obese";
  const label = { under: "偏瘦", normal: "正常", over: "超重", obese: "肥胖" }[level];
  return { bmi, level, label, healthyMinKg: 18.5 * h * h, healthyMaxKg: 23.9 * h * h };
}

export function ageOf(birthDate: string, today = new Date()): number {
  return differenceInYears(today, parseISO(birthDate));
}

/** Mifflin-St Jeor. */
export function bmr(p: Pick<Profile, "gender" | "heightCm" | "birthDate">, weightKg: number, today = new Date()): number {
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * ageOf(p.birthDate, today);
  return p.gender === "male" ? base + 5 : base - 161;
}

/** 当前体重以档案里的数字为准，改完立刻影响目标。体重记录只用于趋势和每周建议。 */
export function latestWeight(profile: Profile, logs: WeightLog[]): number {
  void logs;
  return profile.weightKg;
}

export interface DailyTargets extends Nutrients {
  bmi: BmiInfo;
  bmr: number;
  tdee: number;
  weightKg: number;
  waterMl: number;
  baseKcal: number;
}

export function computeTargets(profile: Profile, logs: WeightLog[], today = new Date()): DailyTargets {
  const cfg = MODE_CONFIG[profile.mode];
  const weightKg = latestWeight(profile, logs);
  const b = bmr(profile, weightKg, today);
  const factor = ACTIVITY_LEVELS.find((a) => a.level === profile.activityLevel)?.factor ?? 1.2;
  const tdee = b * factor;
  const surplus = profile.mode === "gain" ? cfg.surplusKcal[profile.gainPace] : 0;
  const baseKcal = tdee + surplus;
  const o = profile.targetOverride ?? {};
  const kcal = Math.round(o.kcal ?? baseKcal + (profile.calorieAdjustKcal ?? 0));
  const proteinG = Math.round(o.proteinG ?? cfg.proteinPerKg * weightKg);
  const fatG = Math.round(o.fatG ?? (kcal * cfg.fatRatio) / 9);
  const carbG = Math.round(o.carbG ?? Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4));
  return {
    kcal,
    proteinG,
    fatG,
    carbG,
    fiberG: Math.round((kcal / 1000) * 14),
    waterMl: Math.round(weightKg * 35),
    bmi: bmiInfo(weightKg, profile.heightCm),
    bmr: Math.round(b),
    tdee: Math.round(tdee),
    weightKg,
    baseKcal: Math.round(baseKcal),
  };
}

export function scaleNutrients(n: Nutrients, ratio: number): Nutrients {
  return {
    kcal: n.kcal * ratio,
    proteinG: n.proteinG * ratio,
    fatG: n.fatG * ratio,
    carbG: n.carbG * ratio,
    fiberG: n.fiberG * ratio,
  };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    fatG: a.fatG + b.fatG,
    carbG: a.carbG + b.carbG,
    fiberG: a.fiberG + b.fiberG,
  };
}

export const ZERO: Nutrients = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 };

export function mealTargets(daily: Nutrients, split: Record<string, number>): Partial<Record<MealType, Nutrients>> {
  const total = Object.values(split).reduce((s, v) => s + v, 0) || 1;
  return Object.fromEntries(
    Object.entries(split).map(([meal, ratio]) => [meal, scaleNutrients(daily, ratio / total)]),
  ) as Partial<Record<MealType, Nutrients>>;
}

/** 体重变化 1kg 约等于 7700 kcal。返回预计达到目标体重的天数。 */
export function daysToTarget(currentKg: number, targetKg: number, dailySurplusKcal: number): number | null {
  if (dailySurplusKcal <= 0 || targetKg <= currentKg) return null;
  return Math.ceil(((targetKg - currentKg) * 7700) / dailySurplusKcal);
}
