import { addDaysKey, diffDays, isoWeekday, weekDays, weekStartOf } from "@/lib/dates";
import { hashString, mulberry32 } from "@/lib/planner/random";
import type { Settings } from "@/lib/schema/data";

export type ShoppingConfig = Settings["shopping"];

/** 某一周的采购日（升序）。随机模式由 seed + 周起始日决定，两次采购至少间隔 2 天。 */
export function shoppingDates(weekStart: string, cfg: ShoppingConfig): string[] {
  const days = weekDays(weekStart);
  if (cfg.mode === "fixed") {
    return days.filter((d) => cfg.fixedWeekdays.includes(isoWeekday(d)));
  }
  if (cfg.mode === "manual") {
    return cfg.manualDates.filter((d) => weekStartOf(d) === weekStart).sort();
  }
  const rand = mulberry32(cfg.seed ^ hashString(weekStart));
  if (cfg.randomTimesPerWeek === 1) return [days[Math.floor(rand() * 7)]];
  const pairs: [number, number][] = [];
  for (let a = 0; a < 7; a++) for (let b = a + 2; b < 7; b++) pairs.push([a, b]);
  const [a, b] = pairs[Math.floor(rand() * pairs.length)];
  return [days[a], days[b]];
}

/** 当周及前后各一周的采购日，用于计算覆盖区间和"距上次采购天数"。 */
export function shoppingDatesAround(weekStart: string, cfg: ShoppingConfig): string[] {
  return [-7, 0, 7].flatMap((offset) => shoppingDates(addDaysKey(weekStart, offset), cfg));
}

export function lastTripOnOrBefore(date: string, trips: string[]): string | null {
  let best: string | null = null;
  for (const t of trips) if (t <= date && (!best || t > best)) best = t;
  return best;
}

export function nextTripAfter(date: string, trips: string[]): string | null {
  let best: string | null = null;
  for (const t of trips) if (t > date && (!best || t < best)) best = t;
  return best;
}

/** 一次采购要覆盖的天数：从这次采购日到下一次采购的前一天。 */
export function shoppingCycle(tripDates: string[], startDate: string): { start: string; end: string; length: number } {
  const dates = [...new Set(tripDates)].sort();
  const start = dates.find((d) => d >= startDate) ?? startDate;
  const following = nextTripAfter(start, dates);
  const end = following ? addDaysKey(following, -1) : addDaysKey(start, 6);
  return { start, end, length: diffDays(end, start) + 1 };
}

export function cycleContaining(tripDates: string[], date: string): { start: string; end: string; length: number } {
  const start = lastTripOnOrBefore(date, tripDates) ?? date;
  return shoppingCycle(tripDates, start);
}
