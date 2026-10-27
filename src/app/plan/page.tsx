"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, Shuffle, ShoppingCart, Sparkles, BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { MealCell } from "@/components/meal-cell";
import { BmiModeHint } from "@/components/mode-switch";
import { Button, Card, cn, Empty, PageTitle, Progress } from "@/components/ui";
import { effectiveTripDates, generatePlan } from "@/lib/actions";
import { formatDay, isoWeekday, todayKey, WEEKDAY_LABEL, weekStartOf } from "@/lib/dates";
import { fmt, useTargets } from "@/lib/hooks";
import { MODE_CONFIG } from "@/lib/nutrition/modes";
import { useCycleView } from "@/lib/plan-view";
import { cycleContaining, shoppingCycle } from "@/lib/shopping/schedule";
import { isUserPlannedMeal } from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";

export default function PlanPage() {
  const mode = useDataStore((s) => s.data.profile?.mode ?? "maintain");
  const settings = useDataStore((s) => s.data.settings);
  const shoppingTrips = useDataStore((s) => s.data.shoppingTrips);
  const targets = useTargets();
  const today = todayKey();
  const tripDates = useMemo(
    () => effectiveTripDates({ settings, shoppingTrips }, weekStartOf(today), today),
    [settings, shoppingTrips, today],
  );
  const cycles = useMemo(() => {
    const current = cycleContaining(tripDates, today);
    const later = tripDates.filter((d) => d > current.start);
    return [current.start, ...later];
  }, [tripDates, today]);
  const [idx, setIdx] = useState(0);
  const start = cycles[Math.min(idx, cycles.length - 1)] ?? today;
  const cycle = shoppingCycle(tripDates, start);
  const { days, tripDates: viewTrips, hasPlan, length } = useCycleView(cycle.start, cycle.end);
  const recipes = useDataStore((s) => s.data.recipes);
  const recipeMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const userMealCount = useMemo(
    () => days.reduce((n, d) => n + d.entries.filter((e) => isUserPlannedMeal(e, e.recipeId ? recipeMap.get(e.recipeId) : undefined)).length, 0),
    [days, recipeMap],
  );
  const [busy, setBusy] = useState(false);

  const regenerate = async (reseed: boolean) => {
    setBusy(true);
    try {
      await generatePlan(reseed, cycle.start);
    } finally {
      setBusy(false);
    }
  };

  const weekKcal = days.reduce((s, d) => s + d.total.kcal, 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="采购周期菜单"
        subtitle={
          targets && (
            <>
              参考每日 {fmt(targets.kcal)} 千卡 / 蛋白 {targets.proteinG} g · 本段 {length} 天；突出「我的」菜单，推荐菜仅作营养占位
            </>
          )
        }
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-xl bg-white ring-1 ring-gray-200">
              <button className="p-2 text-gray-500 hover:text-gray-800" disabled={idx <= 0} onClick={() => setIdx((i) => i - 1)} aria-label="上一段">
                <ChevronLeft size={18} />
              </button>
              <button className="px-2 text-sm font-medium" onClick={() => setIdx(0)}>
                {formatDay(cycle.start)} – {formatDay(cycle.end)}
              </button>
              <button className="p-2 text-gray-500 hover:text-gray-800" disabled={idx >= cycles.length - 1} onClick={() => setIdx((i) => i + 1)} aria-label="下一段">
                <ChevronRight size={18} />
              </button>
            </div>
            <Link href="/recipes">
              <Button variant="secondary">
                <BookOpen size={16} /> 我的菜单
              </Button>
            </Link>
            <Button variant="ghost" onClick={() => regenerate(hasPlan)} disabled={busy} className="text-gray-500">
              {hasPlan ? <Shuffle size={16} /> : <Sparkles size={16} />}
              {busy ? "生成中…" : hasPlan ? "重填推荐占位" : `自动占位 ${length} 天`}
            </Button>
          </div>
        }
      />
      <BmiModeHint />
      {hasPlan && userMealCount > 0 ? (
        <p className="rounded-xl bg-brand-50/80 px-3 py-2 text-xs text-brand-800 ring-1 ring-brand-100">
          已安排 {userMealCount} 餐「我的」菜单；灰色格为系统营养占位（采购仍按占位计算），点进可改成自己的菜。
        </p>
      ) : (
        <p className="rounded-xl bg-white px-3 py-2 text-xs text-gray-500 ring-1 ring-gray-100">
          先到「我的菜单」建菜谱并指定到某一餐；需要时可一键自动占位 {length} 天（推荐菜不进「我的菜单」）。
        </p>
      )}

      {!hasPlan ? (
        <Empty
          action={
            <Button onClick={() => regenerate(false)} disabled={busy}>
              <Sparkles size={16} /> 自动营养占位 {length} 天
            </Button>
          }
        >
          还没有安排。可先指定「我的菜单」，或用推荐菜谱自动占位 {length} 天再去采购页算要买多少。
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Info size={13} /> {MODE_CONFIG[mode].label} · 本段合计 {fmt(weekKcal)} 千卡 · 已锁定/已吃/外出的餐会保留
            </span>
          </div>
          <div className={cn("grid gap-3", length <= 2 ? "max-w-xl md:grid-cols-1" : length <= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-7")}>
            {days.map((d) => {
              const isToday = d.date === today;
              return (
                <Card key={d.date} className={cn("!p-3", isToday && "ring-2 ring-brand-400")}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className={cn("text-sm font-semibold", isToday ? "text-brand-700" : "text-gray-800")}>{WEEKDAY_LABEL[isoWeekday(d.date)]}</span>
                      <span className="ml-1 text-xs text-gray-400">{formatDay(d.date)}</span>
                    </div>
                    {d.isTrip && (
                      <span className="flex items-center gap-0.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700" title="采购日">
                        <ShoppingCart size={11} /> 采购
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {d.entries.map((e) => (
                      <MealCell key={e.id} entry={e} tripDates={viewTrips} planMode />
                    ))}
                  </div>
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>{fmt(d.total.kcal)} 千卡</span>
                      <span>目标 {fmt(d.targetKcal)}</span>
                    </div>
                    <Progress value={d.total.kcal} max={d.targetKcal} />
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>蛋白 {fmt(d.total.proteinG)}g</span>
                      <span>脂肪 {fmt(d.total.fatG)}g</span>
                      <span>碳水 {fmt(d.total.carbG)}g</span>
                    </div>
                    {d.budget.notes.map((n) => (
                      <p key={n} className="text-[11px] leading-snug text-sky-600">
                        {n}
                      </p>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
