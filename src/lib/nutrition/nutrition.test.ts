import { describe, expect, it } from "vitest";
import type { Profile, WeightLog } from "@/lib/schema/data";
import { bmiInfo, computeTargets } from "./targets";
import { suggestAdjustment, weeklyRate } from "./weeklyAdjust";

const today = new Date("2026-10-15T12:00:00");
const base: Profile = {
  updatedAt: "",
  gender: "male",
  birthDate: "1996-10-01",
  heightCm: 175,
  weightKg: 60,
  activityLevel: 3,
  mode: "maintain",
  gainPace: "steady",
  calorieAdjustKcal: 0,
};

const logs = (weights: number[], startDay = 3): WeightLog[] =>
  weights.map((w, i) => {
    const date = `2026-10-${String(startDay + i * 2).padStart(2, "0")}`;
    return { id: date, date, weightKg: w, updatedAt: "" };
  });

describe("targets", () => {
  it("classifies BMI with Chinese thresholds", () => {
    expect(bmiInfo(55, 175).label).toBe("偏瘦");
    expect(bmiInfo(70, 175).label).toBe("正常");
    expect(bmiInfo(75, 175).label).toBe("超重");
    expect(bmiInfo(90, 175).label).toBe("肥胖");
  });

  it("computes maintain targets from Mifflin-St Jeor", () => {
    const t = computeTargets(base, [], today);
    // 10*60 + 6.25*175 - 5*30 + 5 = 1548.75
    expect(t.bmr).toBe(1549);
    expect(t.tdee).toBe(Math.round(1548.75 * 1.55));
    expect(t.kcal).toBe(t.tdee);
    expect(t.proteinG).toBe(72);
  });

  it("adds surplus and higher protein in gain mode", () => {
    const steady = computeTargets({ ...base, mode: "gain" }, [], today);
    const fast = computeTargets({ ...base, mode: "gain", gainPace: "fast" }, [], today);
    const maintain = computeTargets(base, [], today);
    expect(steady.kcal - maintain.kcal).toBe(300);
    expect(fast.kcal - maintain.kcal).toBe(500);
    expect(steady.proteinG).toBe(108);
  });

  it("respects overrides and adjustments", () => {
    expect(computeTargets({ ...base, calorieAdjustKcal: 150 }, [], today).kcal).toBe(computeTargets(base, [], today).kcal + 150);
    expect(computeTargets({ ...base, targetOverride: { kcal: 2000 } }, [], today).kcal).toBe(2000);
  });
});

describe("weekly adjustment", () => {
  it("estimates weekly rate", () => {
    expect(weeklyRate(logs([60, 60.1, 60.2, 60.3]))!).toBeCloseTo(0.35, 2);
  });

  it("suggests more calories when gaining too slowly", () => {
    const s = suggestAdjustment({ ...base, mode: "gain" }, logs([60, 60, 60.05, 60, 60.05, 60.05]), today);
    expect(s?.delta).toBe(150);
  });

  it("suggests fewer calories in maintain mode when above baseline", () => {
    const s = suggestAdjustment({ ...base, baselineWeightKg: 60 }, logs([61.4, 61.5, 61.6, 61.5, 61.6, 61.5]), today);
    expect(s?.delta).toBe(-100);
  });

  it("waits a week between suggestions", () => {
    const s = suggestAdjustment({ ...base, mode: "gain", lastAdjustCheck: "2026-10-12" }, logs([60, 60, 60, 60, 60, 60]), today);
    expect(s).toBeNull();
  });
});
