"use client";

import { ChevronLeft, ChevronRight, Info, Shuffle, ShoppingCart, Sparkles } from "lucide-react";
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
import { useDataStore } from "@/lib/store/data-store";

export default function PlanPage() {
  const data = useDataStore((s) => s.data);
  const targets = useTargets();
  const mode = data.profile?.mode ?? "maintain";
  const today = todayKey();
  const tripDates = useMemo(() => effectiveTripDates(data, weekStartOf(today), today), [data, today]);
  const cycles = useMemo(() => {
    const current = cycleContaining(tripDates, today);
    const later = tripDates.filter((d) => d > current.start);
    return [current.start, ...later];
  }, [tripDates, today]);
  const [idx, setIdx] = useState(0);
  const start = cycles[Math.min(idx, cycles.length - 1)] ?? today;
  const cycle = shoppingCycle(tripDates, start);
  const { days, tripDates: viewTrips, hasPlan, length } = useCycleView(cycle.start, cycle.end);
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
              参考每日 {fmt(targets.kcal)} 千卡 / 蛋白 {targets.proteinG} g · 随机排出到下次采购前的 {length} 天，再按这些菜决定买多少
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
            <Button onClick={() => regenerate(hasPlan)} disabled={busy}>
              {hasPlan ? <Shuffle size={16} /> : <Sparkles size={16} />}
              {busy ? "生成中…" : hasPlan ? "按营养再随机" : `随机生成 ${length} 天`}
            </Button>
          </div>
        }
      />
      <BmiModeHint />
      <p className="rounded-xl bg-white px-3 py-2 text-xs text-gray-500 ring-1 ring-gray-100">
        推荐菜谱只作为抽选池，不会进「我的菜单」。写进这 {length} 天计划的菜才会拿去算采购清单。
      </p>

      {!hasPlan ? (
        <Empty
          action={
            <Button onClick={() => regenerate(false)} disabled={busy}>
              <Sparkles size={16} /> 按营养随机生成 {length} 天菜品
            </Button>
          }
        >
          这段采购周期还没有菜。先按营养目标随机排出 {length} 天，再去采购页看要买哪些整包商品。
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
                      <MealCell key={e.id} entry={e} tripDates={viewTrips} />
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
