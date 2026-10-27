"use client";

import { Check, Lock, MoreHorizontal, Plus, RefreshCw, Snowflake, Store, TriangleAlert, Unlock, Utensils, Ban, ListChecks, BookOpen, ExternalLink } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { markEaten, rerollMeal, setCustomMeal, setMealKind, setMealRecipe, toggleLock } from "@/lib/actions";

const MealCompose = dynamic(() => import("@/components/meal-compose").then((m) => m.MealCompose), { ssr: false });
import { amountLabel, serveStyle } from "@/lib/food/serve";
import { diffDays } from "@/lib/dates";
import { fmt, useIngredientMap, useProductMap, useRecipeMap } from "@/lib/hooks";
import { itemsNutrients } from "@/lib/nutrition/recipe";
import { EAT_OUT_LEVELS, eatOutKcal, type EatOutLevel } from "@/lib/planner/eatOut";
import { isUserPlannedMeal, isUserRecipe, MEAL_LABEL, type MealEntry } from "@/lib/schema/data";
import { lastTripOnOrBefore } from "@/lib/shopping/schedule";
import { useDataStore } from "@/lib/store/data-store";
import { Button, cn, Input, Modal, NumberInput } from "./ui";

export function useShelfRisk(entry: MealEntry, tripDates: string[]) {
  const ing = useIngredientMap();
  return useMemo(() => {
    const trip = lastTripOnOrBefore(entry.date, tripDates);
    if (!trip || entry.kind !== "home") return { freeze: [] as string[], risk: [] as string[] };
    const since = diffDays(entry.date, trip);
    const freeze: string[] = [];
    const risk: string[] = [];
    for (const item of entry.items) {
      const i = ing.get(item.ingredientId);
      if (!i || i.storage === "freezer" || since < i.shelfLifeDays) continue;
      (i.freezable ? freeze : risk).push(i.name);
    }
    return { freeze, risk };
  }, [entry, tripDates, ing]);
}

export function MealCell({ entry, tripDates, compact, planMode }: { entry: MealEntry; tripDates: string[]; compact?: boolean; planMode?: boolean }) {
  const recipes = useRecipeMap();
  const ing = useIngredientMap();
  const products = useProductMap();
  const [menu, setMenu] = useState(false);
  const [startView, setStartView] = useState<"main" | "compose">("main");
  const [busy, setBusy] = useState(false);
  const recipe = entry.recipeId ? recipes.get(entry.recipeId) : undefined;
  const userPlanned = isUserPlannedMeal(entry, recipe);
  const presetPlaceholder = Boolean(planMode && entry.kind === "home" && entry.items.length > 0 && !userPlanned);
  const n = itemsNutrients(entry.items, ing);
  const { freeze, risk } = useShelfRisk(entry, tripDates);
  const title =
    entry.customName ||
    recipe?.name ||
    (entry.items.length > 0
      ? entry.items
          .map((i) => {
            const product = i.productId ? products.get(i.productId) : undefined;
            const ingredient = ing.get(i.ingredientId);
            return `${product?.name ?? ingredient?.name ?? "食材"} ${amountLabel(i.grams, serveStyle(product, ingredient))}`;
          })
          .join(" + ")
      : "还没定菜");
  const openMenu = (view: "main" | "compose" = "main") => {
    setStartView(view);
    setMenu(true);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group relative rounded-xl p-2.5 text-left ring-1 transition",
          entry.kind === "eat_out"
            ? "bg-sky-50 ring-sky-100"
            : entry.kind === "skip"
              ? "bg-gray-50 ring-gray-100"
              : presetPlaceholder
                ? "bg-gray-50/60 ring-gray-100/80 hover:ring-gray-200"
                : planMode && userPlanned
                  ? "bg-white ring-2 ring-brand-200 shadow-sm hover:ring-brand-300"
                  : "bg-white ring-gray-100 hover:ring-brand-200",
          entry.eaten && "opacity-60",
          busy && "animate-pulse",
        )}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-medium text-gray-400">{MEAL_LABEL[entry.mealType]}</span>
          <div className="flex items-center gap-0.5 text-gray-400">
            {entry.locked && <Lock size={12} className="text-brand-600" />}
            {entry.eaten && <Check size={12} className="text-brand-600" />}
            {freeze.length > 0 && <Snowflake size={12} className="text-sky-500" aria-label="需冷冻保存" />}
            {risk.length > 0 && <TriangleAlert size={12} className="text-amber-500" aria-label="保质期风险" />}
            <button onClick={() => openMenu("main")} className="rounded p-0.5 hover:bg-gray-100 hover:text-gray-700" aria-label="操作">
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>
        <button className="mt-0.5 block w-full text-left" onClick={() => openMenu(entry.kind === "home" && entry.items.length === 0 ? "compose" : "main")}>
          {entry.kind === "home" && (
            <>
              {presetPlaceholder ? (
                <>
                  <div className="text-[12px] leading-snug text-gray-400">营养占位（推荐菜谱）</div>
                  <div className="mt-0.5 truncate text-[10px] text-gray-300" title={title}>
                    {recipe?.name ?? title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {fmt(n.kcal)} 千卡 · 蛋白 {fmt(n.proteinG)}g{entry.scale !== 1 && ` · ${entry.scale} 份`}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-1">
                    {planMode && userPlanned && (
                      <span className="mt-0.5 shrink-0 rounded bg-brand-100 px-1 py-px text-[9px] font-semibold text-brand-700">我的</span>
                    )}
                    <div className={cn("min-w-0 flex-1 font-medium leading-snug text-gray-800", compact ? "text-sm" : "text-[13px]")}>{title}</div>
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {entry.items.length > 0 ? (
                      <>
                        {fmt(n.kcal)} 千卡 · 蛋白 {fmt(n.proteinG)}g{entry.scale !== 1 && ` · ${entry.scale} 份`}
                      </>
                    ) : (
                      "点这里自己配，或指定菜单"
                    )}
                  </div>
                </>
              )}
            </>
          )}
          {entry.kind === "eat_out" && (
            <>
              <div className="flex items-center gap-1 text-[13px] font-medium text-sky-700">
                <Store size={13} /> 外出就餐
              </div>
              <div className="mt-0.5 text-[11px] text-sky-600/70">
                约 {fmt(eatOutKcal(entry))} 千卡{entry.eatOutLevel && entry.eatOutLevel !== "custom" && ` · ${EAT_OUT_LEVELS[entry.eatOutLevel].label}`}
              </div>
            </>
          )}
          {entry.kind === "skip" && <div className="text-[13px] text-gray-400">不吃</div>}
        </button>
        {entry.kind === "home" && !entry.eaten && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openMenu("compose");
            }}
            className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700"
          >
            <Plus size={11} /> 自己配
          </button>
        )}
        {!compact && !presetPlaceholder && entry.kind === "home" && !entry.locked && !entry.eaten && entry.items.length > 0 && (
          <button
            onClick={() => run(() => rerollMeal(entry))}
            className="absolute bottom-1.5 right-1.5 hidden rounded-md bg-white p-1 text-gray-400 shadow-sm ring-1 ring-gray-100 hover:text-brand-600 group-hover:block"
            title="换一个"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>
      {menu && <MealMenu entry={entry} open startView={startView} onClose={() => setMenu(false)} run={run} freeze={freeze} risk={risk} />}
    </>
  );
}

function MealMenu({
  entry,
  open,
  startView,
  onClose,
  run,
  freeze,
  risk,
}: {
  entry: MealEntry;
  open: boolean;
  startView: "main" | "compose";
  onClose: () => void;
  run: (fn: () => Promise<void>) => Promise<void>;
  freeze: string[];
  risk: string[];
}) {
  const recipes = useDataStore((s) => s.data.recipes);
  const ing = useIngredientMap();
  const products = useProductMap();
  const recipeMap = useRecipeMap();
  const [view, setView] = useState<"main" | "eatout" | "pick" | "compose">(startView);
  const [level, setLevel] = useState<EatOutLevel>(entry.eatOutLevel ?? "normal");
  const [custom, setCustom] = useState<number | undefined>(entry.eatOutKcal ?? 800);
  const [query, setQuery] = useState("");
  const recipe = entry.recipeId ? recipeMap.get(entry.recipeId) : undefined;
  const type = entry.mealType === "snack2" ? "snack" : entry.mealType;

  useEffect(() => {
    if (open) setView(startView);
  }, [open, startView]);

  const act = (fn: () => Promise<void>) => {
    onClose();
    setView("main");
    void run(fn);
  };

  const close = () => {
    onClose();
    setView("main");
  };

  return (
    <Modal open={open} onClose={close} title={`${entry.date} ${MEAL_LABEL[entry.mealType]}`} wide={view === "compose"}>
      {view === "compose" && (
        <MealCompose
          entry={entry}
          onBack={() => setView("main")}
          onSave={(items, customName, saveRecipe) => act(() => setCustomMeal(entry, items, { name: customName, saveRecipe }))}
        />
      )}
      {view === "main" && (
        <div className="space-y-4">
          {entry.kind === "home" && (recipe || entry.customName || entry.items.length > 0) && (
            <div className="rounded-xl bg-gray-50 p-3">
              <div className="font-semibold">{entry.customName || recipe?.name || "自己配的一餐"}</div>
              <div className="mt-1 text-xs text-gray-500">
                {entry.scale} 份 · {fmt(itemsNutrients(entry.items, ing).kcal)} 千卡
                {recipe ? ` · 约 ${recipe.cookMinutes} 分钟` : ""}
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {entry.items.map((i) => {
                  const product = i.productId ? products.get(i.productId) : undefined;
                  const style = serveStyle(product, ing.get(i.ingredientId));
                  return (
                    <li key={`${i.productId ?? ""}-${i.ingredientId}`} className="flex justify-between gap-2">
                      <span className="truncate">{product?.name ?? ing.get(i.ingredientId)?.name ?? "已删除"}</span>
                      <span className="shrink-0 text-gray-500">{amountLabel(i.grams, style)}</span>
                    </li>
                  );
                })}
              </ul>
              {(recipe?.guideUrl || recipe?.guideNotes) && (
                <div className="mt-2 space-y-1 border-t border-gray-200/80 pt-2">
                  {recipe.guideUrl && (
                    <a
                      href={/^https?:\/\//i.test(recipe.guideUrl.trim()) ? recipe.guideUrl.trim() : `https://${recipe.guideUrl.trim()}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                    >
                      <ExternalLink size={12} /> 制作视频 / 文档
                    </a>
                  )}
                  {recipe.guideNotes && <p className="whitespace-pre-wrap text-xs text-gray-600">{recipe.guideNotes}</p>}
                </div>
              )}
              {freeze.length > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs text-sky-600">
                  <Snowflake size={12} /> {freeze.join("、")} 距采购日较久，采购后请冷冻，提前一晚解冻。
                </p>
              )}
              {risk.length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                  <TriangleAlert size={12} /> {risk.join("、")} 可能已过保质期，建议补购或换一个。
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setView("compose")}>
              <Plus size={16} /> 自己配这餐
            </Button>
            <Button variant="secondary" onClick={() => setView("pick")}>
              <BookOpen size={16} /> 指定菜单
            </Button>
            {entry.kind === "home" && !entry.eaten && (
              <Button variant="secondary" onClick={() => act(() => rerollMeal(entry))} disabled={entry.locked}>
                <RefreshCw size={16} /> 换一个
              </Button>
            )}
            {entry.kind === "home" && (
              <Button variant="secondary" onClick={() => act(() => toggleLock(entry))}>
                {entry.locked ? <Unlock size={16} /> : <Lock size={16} />} {entry.locked ? "解除锁定" : "锁定这餐"}
              </Button>
            )}
            {entry.kind !== "eat_out" && (
              <Button variant="secondary" onClick={() => setView("eatout")}>
                <Store size={16} /> 外出就餐
              </Button>
            )}
            {entry.kind !== "skip" && (
              <Button variant="secondary" onClick={() => act(() => setMealKind(entry, "skip"))}>
                <Ban size={16} /> 这餐不吃
              </Button>
            )}
            {entry.kind !== "home" && (
              <Button variant="secondary" onClick={() => act(() => setMealKind(entry, "home"))}>
                <Utensils size={16} /> 改回在家吃
              </Button>
            )}
            {entry.kind === "eat_out" && (
              <Button variant="secondary" onClick={() => setView("eatout")}>
                <Store size={16} /> 修改外食热量
              </Button>
            )}
            <Button variant={entry.eaten ? "secondary" : "primary"} onClick={() => act(() => markEaten(entry, !entry.eaten))}>
              <ListChecks size={16} /> {entry.eaten ? "取消已吃" : "标记已吃"}
            </Button>
          </div>
          {entry.kind === "home" && <p className="text-xs text-gray-400">标记已吃会按到期日从早到晚扣减库存。锁定的餐在重新生成时保持不变。</p>}
        </div>
      )}

      {view === "eatout" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">估算这顿外食的热量，当天其余在家的餐会自动减量；吃得特别多时，后两天也会少量减少。</p>
          {(Object.keys(EAT_OUT_LEVELS) as (keyof typeof EAT_OUT_LEVELS)[]).map((k) => (
            <button
              key={k}
              onClick={() => setLevel(k)}
              className={cn("flex w-full items-center justify-between rounded-xl px-4 py-3 ring-1", level === k ? "bg-brand-50 ring-brand-500" : "ring-gray-200")}
            >
              <span>
                <span className="font-medium">{EAT_OUT_LEVELS[k].label}</span>
                <span className="ml-2 text-xs text-gray-500">{EAT_OUT_LEVELS[k].hint}</span>
              </span>
              <span className="text-sm text-gray-500">约 {EAT_OUT_LEVELS[k].kcal} 千卡</span>
            </button>
          ))}
          <button
            onClick={() => setLevel("custom")}
            className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1", level === "custom" ? "bg-brand-50 ring-brand-500" : "ring-gray-200")}
          >
            <span className="font-medium">自定义</span>
            <NumberInput value={custom} onChange={setCustom} className="max-w-32" onClick={(e) => e.stopPropagation()} />
          </button>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setView("main")}>
              返回
            </Button>
            <Button onClick={() => act(() => setMealKind(entry, "eat_out", { level, kcal: level === "custom" ? custom : undefined }))}>确定</Button>
          </div>
        </div>
      )}

      {view === "pick" && (
        <div className="space-y-3">
          <Input placeholder="搜索菜单（我的 / 推荐）" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {recipes
              .filter((r) => r.mealTypes.includes(type) && (!query || r.name.includes(query)))
              .sort((a, b) => Number(isUserRecipe(b)) - Number(isUserRecipe(a)) || a.name.localeCompare(b.name, "zh"))
              .map((r) => (
                <button
                  key={r.id}
                  onClick={() => act(() => setMealRecipe(entry, r.id))}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-gray-50"
                >
                  <span className="text-sm">
                    {r.name}
                    <span className="ml-2 text-[11px] text-gray-400">{isUserRecipe(r) ? "我的" : "推荐"}</span>
                  </span>
                  <span className="text-xs text-gray-400">{fmt(itemsNutrients(r.items, ing).kcal)} 千卡</span>
                </button>
              ))}
          </div>
          <p className="text-xs text-gray-400">指定的菜谱按 1 份计并自动锁定，当天其他餐会重新平衡。</p>
          <Button variant="ghost" onClick={() => setView("main")}>
            返回
          </Button>
        </div>
      )}
    </Modal>
  );
}
