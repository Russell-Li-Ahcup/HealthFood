import { addDays, differenceInCalendarDays, format, getISODay, parseISO, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";

export const toKey = (d: Date) => format(d, "yyyy-MM-dd");
export const fromKey = (key: string) => parseISO(key);
export const todayKey = () => toKey(new Date());
export const addDaysKey = (key: string, days: number) => toKey(addDays(fromKey(key), days));
export const diffDays = (a: string, b: string) => differenceInCalendarDays(fromKey(a), fromKey(b));
export const weekStartOf = (key: string) => toKey(startOfWeek(fromKey(key), { weekStartsOn: 1 }));
export const weekDays = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i));
export const enumerateDays = (from: string, to: string) => {
  const n = diffDays(to, from);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDaysKey(from, i));
};
/** 1 = 周一 … 7 = 周日 */
export const isoWeekday = (key: string) => getISODay(fromKey(key));

export const WEEKDAY_LABEL = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export const formatDay = (key: string) => format(fromKey(key), "M月d日", { locale: zhCN });
export const formatDayWeek = (key: string) => `${formatDay(key)} ${WEEKDAY_LABEL[isoWeekday(key)]}`;
