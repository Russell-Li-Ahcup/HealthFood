"use client";

import { CalendarDays, ChevronRight, ListChecks, ShoppingCart, Sparkles, Target } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { AdjustBanner } from "@/components/adjust-banner";
import { ChartPlaceholder, Ring } from "@/components/charts";
import { MealCell } from "@/components/meal-cell";
import { BmiModeHint } from "@/components/mode-switch";
import { Badge, Button, Card, Empty, Progress } from "@/components/ui";
import { cycleFromData, generatePlan, markPastMealsEaten } from "@/lib/actions";
import { diffDays, formatDay, formatDayWeek, isoWeekday, todayKey, WEEKDAY_LABEL } from "@/lib/dates";
import { fmt, useIngredientMap, useTargets } from "@/lib/hooks";
import { daysLeft, EXPIRY_STYLE, expiryLevel, expiringSoon } from "@/lib/inventory/expiry";
import { stockName, stockQtyText } from "@/lib/inventory/label";
import { FOOD_GROUPS, GROUP_KEYS, groupGrams } from "@/lib/nutrition/foodGroups";
import { MODE_CONFIG } from "@/lib/nutrition/modes";
import { daysToTarget } from "@/lib/nutrition/targets";
import { useCycleView } from "@/lib/plan-view";
import { tripTotal } from "@/lib/shopping/demand";
import { useDataStore } from "@/lib/store/data-store";

const WeekKcalChart = dynamic(() => import("@/components/charts-recharts").then((m) => m.WeekKcalChart), {
  ssr: false,
  loading: () => <ChartPlaceholder height={200} />,
});
const FoodGroupRadar = dynamic(() => import("@/components/charts-recharts").then((m) => m.FoodGroupRadar), {
  ssr: false,
  loading: () => <ChartPlaceholder height={220} />,
});
const WeightChart = dynamic(() => import("@/components/weight-chart"), {
  ssr: false,
  loading: () => <ChartPlaceholder height={140} />,
});

export default function Dashboard() {
  const profile = useDataStore((s) => s.data.profile);
  const settings = useDataStore((s) => s.data.settings);
  const shoppingTrips = useDataStore((s) => s.data.shoppingTrips);
  const mealEntries = useDataStore((s) => s.data.mealEntries);
  const inventory = useDataStore((s) => s.data.inventory);
  const products = useDataStore((s) => s.data.products);
  const targets = useTargets();
  const ing = useIngredientMap();
  const productsMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const today = todayKey();
  const cycle = useMemo(() => cycleFromData({ settings, shoppingTrips }, today), [settings, shoppingTrips, today]);
  const { days, tripDates, hasPlan, length } = useCycleView(cycle.start, cycle.end);
  const todayView = days.find((d) => d.date === today);
  const pastPending = mealEntries.filter((e) => e.date < today && e.date >= cycle.start && !e.eaten && e.kind === "home").length;
  const expiring = expiringSoon(inventory, today, 3);
  const nextTrip = shoppingTrips.filter((t) => t.status === "planned" && t.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];

  const usedSoon = useMemo(() => {
    const upcoming = mealEntries.filter((e) => e.date >= today && e.kind === "home" && !e.eaten);
    return new Set(upcoming.flatMap((e) => e.items.flatMap((i) => [i.ingredientId, i.productId].filter((id): id is string => Boolean(id)))));
  }, [mealEntries, today]);

  if (!profile || !targets) return null;
  const cfg = MODE_CONFIG[profile.mode];
  const t = todayView?.total;
  const eatenTotal = todayView?.entries.filter((e) => e.eaten || e.kind === "eat_out");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{formatDayWeek(today)}</h1>
          <p className="text-sm text-gray-500">
            {cfg.label} · 今日目标 {fmt(todayView?.targetKcal ?? targets.kcal)} 千卡
            {eatenTotal && eatenTotal.length > 0 && ` · 已完成 ${eatenTotal.length}/${todayView?.entries.length} 餐`}
          </p>
        </div>
        <Link href="/plan">
          <Button variant="secondary">
            <CalendarDays size={16} /> 查看到下次采购前的菜单
          </Button>
        </Link>
      </div>

      <AdjustBanner />
      <BmiModeHint />
      {pastPending > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-gray-100">
          <ListChecks className="text-brand-600" size={20} />
          <p className="flex-1 text-sm">这段采购周期里还有 {pastPending} 餐没有标记，标记后会从库存中扣减对应食材。</p>
          <Button size="sm" onClick={() => void markPastMealsEaten()}>
            全部标记为已吃
          </Button>
        </div>
      )}

      {!hasPlan ? (
        <Empty
          action={
            <Button onClick={() => void generatePlan()}>
              <Sparkles size={16} /> 按营养随机生成 {length} 天
            </Button>
          }
        >
          到下次采购前这 {length} 天还没有菜。先随机排出菜单，再去采购页看要买几包。
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="今天吃什么" className="lg:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2">
              {todayView?.entries.map((e) => (
                <MealCell key={e.id} entry={e} tripDates={tripDates} compact />
              ))}
            </div>
            {todayView?.budget.notes.map((n) => (
              <p key={n} className="mt-2 text-xs text-sky-600">
                {n}
              </p>
            ))}
          </Card>
          <Card title="今日营养（按计划）">
            {t && (
              <div className="grid grid-cols-2 gap-y-4">
                <Ring value={t.kcal} max={todayView!.targetKcal} label="热量" unit="千卡" />
                <Ring value={t.proteinG} max={targets.proteinG} label="蛋白质" unit="g" color="#6366f1" warnOver={false} />
                <Ring value={t.fatG} max={targets.fatG} label="脂肪" unit="g" color="#f59e0b" />
                <Ring value={t.carbG} max={targets.carbG} label="碳水" unit="g" color="#0ea5e9" />
              </div>
            )}
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="保质期提醒"
          action={
            <Link href="/inventory" className="flex items-center text-xs text-brand-600">
              全部库存 <ChevronRight size={14} />
            </Link>
          }
        >
          {expiring.length === 0 ? (
            <p className="text-sm text-gray-400">3 天内没有要到期的商品。</p>
          ) : (
            <ul className="space-y-2">
              {expiring.slice(0, 6).map((i) => {
                const level = expiryLevel(i.expiresAt, today);
                const d = daysLeft(i.expiresAt, today);
                const product = i.productId ? productsMap.get(i.productId) : undefined;
                const ingredient = i.ingredientId ? ing.get(i.ingredientId) : product?.ingredientId ? ing.get(product.ingredientId) : undefined;
                const used = (i.productId && usedSoon.has(i.productId)) || (i.ingredientId && usedSoon.has(i.ingredientId));
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {stockName(i, productsMap, ing)} <span className="text-xs text-gray-400">{stockQtyText(i.quantityG, product, ingredient)}</span>
                      {!used && d >= 0 && <span className="block text-[11px] text-amber-600">近期菜单没有用到，可以换一餐用掉</span>}
                    </span>
                    <Badge className={EXPIRY_STYLE[level].className}>{EXPIRY_STYLE[level].label(d)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="下次采购"
          action={
            <Link href="/shopping" className="flex items-center text-xs text-brand-600">
              采购清单 <ChevronRight size={14} />
            </Link>
          }
        >
          {nextTrip ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-brand-700">{diffDays(nextTrip.date, today) === 0 ? "今天" : `${diffDays(nextTrip.date, today)} 天后`}</span>
                <span className="text-sm text-gray-500">{formatDayWeek(nextTrip.date)}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {nextTrip.items.length} 件商品
                {tripTotal(nextTrip) > 0 && `，预计 ${fmt(tripTotal(nextTrip))} 元`}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-gray-400">
                {nextTrip.items
                  .map((i) => products.find((p) => p.id === i.productId)?.name ?? ing.get(i.ingredientId ?? "")?.name)
                  .filter(Boolean)
                  .join("、") || "还没添加商品"}
              </p>
              <Link href="/shopping">
                <Button size="sm" className="mt-3">
                  <ShoppingCart size={14} /> 打开清单
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无计划中的采购。先排出菜单，再按这些菜决定买多少。</p>
          )}
        </Card>

        <ModeCard />
      </div>

      {hasPlan && (
        <Card title={`到下次采购前 ${length} 天热量`}>
          <WeekKcalChart data={days.map((d) => ({ day: `${WEEKDAY_LABEL[isoWeekday(d.date)]} ${formatDay(d.date)}`, kcal: d.total.kcal }))} target={targets.kcal} />
        </Card>
      )}
    </div>
  );
}

function ModeCard() {
  const profile = useDataStore((s) => s.data.profile)!;
  const logs = useDataStore((s) => s.data.weightLogs);
  const entries = useDataStore((s) => s.data.mealEntries);
  const targets = useTargets()!;
  const ing = useIngredientMap();
  const today = todayKey();

  if (profile.mode === "gain") {
    const start = [...logs].sort((a, b) => a.date.localeCompare(b.date)).find((l) => !profile.modeChangedAt || l.date >= profile.modeChangedAt)?.weightKg ?? profile.weightKg;
    const target = profile.targetWeightKg;
    const current = targets.weightKg;
    const days = target ? daysToTarget(current, target, targets.kcal - targets.tdee) : null;
    return (
      <Card title="增重进度" action={<Target size={16} className="text-brand-600" />}>
        {target ? (
          <>
            <div className="flex justify-between text-sm">
              <span>{start} kg</span>
              <b className="text-brand-700">{current} kg</b>
              <span>{target} kg</span>
            </div>
            <Progress value={Math.max(0, current - start)} max={Math.max(0.1, target - start)} className="mt-2 h-3" />
            <p className="mt-2 text-xs text-gray-500">
              {current >= target ? "已达到目标体重，可以切换到健康保持模式。" : `还差 ${fmt(target - current, 1)} kg${days ? `，按当前热量预计约 ${days} 天` : ""}。`}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            在
            <Link href="/profile" className="text-brand-600 hover:underline">
              身体档案
            </Link>
            中设置目标体重即可查看进度。
          </p>
        )}
        <div className="mt-3">
          <WeightChart logs={logs} target={target} height={140} />
        </div>
      </Card>
    );
  }

  const todayItems = entries.filter((e) => e.date === today && e.kind === "home").flatMap((e) => e.items);
  const grams = groupGrams(todayItems, ing);
  const radar = GROUP_KEYS.map((k) => ({ group: FOOD_GROUPS[k].label, pct: Math.min(150, Math.round((grams[k] / FOOD_GROUPS[k].min) * 100)) }));
  return (
    <Card title="今日膳食均衡">
      <FoodGroupRadar data={radar} />
      <p className="text-xs text-gray-500">按《中国居民膳食指南》每日推荐量下限计算达成率，100% 即达标。</p>
      <div className="mt-2">
        <WeightChart logs={logs} baseline={profile.baselineWeightKg} height={120} />
      </div>
    </Card>
  );
}
