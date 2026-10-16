import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Profile, WeightLog } from "@/lib/schema/data";
import { MODE_CONFIG } from "./modes";

export interface AdjustSuggestion {
  delta: number;
  next: number;
  reason: string;
}

/** 最小二乘拟合，返回 kg/周。 */
export function weeklyRate(logs: WeightLog[]): number | null {
  if (logs.length < 3) return null;
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = parseISO(sorted[0].date);
  const xs = sorted.map((l) => differenceInCalendarDays(parseISO(l.date), t0));
  const ys = sorted.map((l) => l.weightKg);
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (den === 0) return null;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den;
  return slope * 7;
}

function recentLogs(logs: WeightLog[], today: Date, days: number): WeightLog[] {
  return logs.filter((l) => {
    const d = differenceInCalendarDays(today, parseISO(l.date));
    return d >= 0 && d < days;
  });
}

/** 每 7 天最多给一次建议；需要最近 14 天内至少 3 次、跨度 ≥ 10 天的体重记录。 */
export function suggestAdjustment(profile: Profile, logs: WeightLog[], today = new Date()): AdjustSuggestion | null {
  if (profile.targetOverride?.kcal) return null;
  if (profile.lastAdjustCheck && differenceInCalendarDays(today, parseISO(profile.lastAdjustCheck)) < 7) return null;
  const since = profile.modeChangedAt ? parseISO(profile.modeChangedAt) : null;
  const recent = recentLogs(logs, today, 14).filter((l) => !since || parseISO(l.date) >= since);
  if (recent.length < 3) return null;
  const dates = recent.map((l) => l.date).sort();
  if (differenceInCalendarDays(parseISO(dates[dates.length - 1]), parseISO(dates[0])) < 10) return null;

  const [lo, hi] = MODE_CONFIG[profile.mode].adjustRange;
  const current = profile.calorieAdjustKcal ?? 0;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  let delta = 0;
  let reason = "";

  if (profile.mode === "gain") {
    const rate = weeklyRate(recent);
    if (rate === null) return null;
    if (rate < 0.2) {
      delta = 150;
      reason = `最近两周平均每周增重 ${rate.toFixed(2)} kg，低于 0.2 kg，建议每天多吃 150 千卡`;
    } else if (rate > 0.7) {
      delta = -150;
      reason = `最近两周平均每周增重 ${rate.toFixed(2)} kg，超过 0.7 kg（可能增脂过多），建议每天少吃 150 千卡`;
    }
  } else {
    const baseline = profile.baselineWeightKg ?? profile.weightKg;
    const avg = recent.reduce((s, l) => s + l.weightKg, 0) / recent.length;
    const diff = avg - baseline;
    if (diff > 1) {
      delta = -100;
      reason = `最近两周平均体重比基准高 ${diff.toFixed(1)} kg，建议每天少吃 100 千卡`;
    } else if (diff < -1) {
      delta = 100;
      reason = `最近两周平均体重比基准低 ${(-diff).toFixed(1)} kg，建议每天多吃 100 千卡`;
    }
  }
  const next = clamp(current + delta);
  if (delta === 0 || next === current) return null;
  return { delta: next - current, next, reason };
}
