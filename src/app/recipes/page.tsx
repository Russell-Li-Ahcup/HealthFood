"use client";

import { Clock, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, cn, Field, Input, Modal, NumberInput, PageTitle, Select } from "@/components/ui";
import { fmt, useIngredientMap } from "@/lib/hooks";
import { itemsNutrients } from "@/lib/nutrition/recipe";
import { generateId, isUserRecipe, MEAL_LABEL, type Recipe, type RecipeItem } from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";

const MEAL_OPTIONS: Recipe["mealTypes"] = ["breakfast", "lunch", "dinner", "snack"];
const TAG_OPTIONS = ["增重友好", "清淡", "高纤维"];

function guideHref(url: string) {
  const t = url.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export default function RecipesPage() {
  const recipes = useDataStore((s) => s.data.recipes);
  const ing = useIngredientMap();
  const [tab, setTab] = useState<"mine" | "recommend">("mine");
  const [filter, setFilter] = useState<Recipe["mealTypes"][number] | "all">("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);

  const list = useMemo(
    () =>
      recipes
        .filter((r) => (tab === "mine" ? isUserRecipe(r) : !isUserRecipe(r)))
        .filter((r) => (filter === "all" || r.mealTypes.includes(filter)) && (!query || r.name.includes(query)))
        .sort((a, b) => a.name.localeCompare(b.name, "zh")),
    [recipes, tab, filter, query],
  );

  return (
    <div className="space-y-4">
      <PageTitle
        title="菜单"
        subtitle="推荐菜单只作随机抽选，不会写进「我的菜单」。随机排出到下次采购前的菜之后，再按这些菜决定买多少。"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> 新建菜单
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {(
            [
              ["mine", "我的菜单"],
              ["recommend", "推荐"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition", tab === id ? "bg-white text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-700")}
            >
              {label}
            </button>
          ))}
        </div>
        <Input placeholder="搜索菜单" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-56" />
        {(["all", ...MEAL_OPTIONS] as const).map((m) => (
          <button
            key={m}
            onClick={() => setFilter(m)}
            className={cn("rounded-full px-3 py-1 text-xs ring-1", filter === m ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-600 ring-gray-200")}
          >
            {m === "all" ? "全部" : MEAL_LABEL[m]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          {tab === "mine" ? "还没有自己的菜单。推荐菜不会自动写进来，需要的话可以新建。" : "暂无推荐菜单。"}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => {
            const n = itemsNutrients(r.items, ing);
            const missing = r.items.some((i) => !ing.has(i.ingredientId));
            const mine = isUserRecipe(r);
            return (
              <button key={r.id} onClick={() => setEditing(r)} className="text-left">
                <Card className="h-full transition hover:ring-brand-200">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{r.name}</h3>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                      <Clock size={12} /> {r.cookMinutes} 分钟
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge className={mine ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-gray-50 text-gray-500 ring-gray-200"}>{mine ? "我的" : "推荐"}</Badge>
                    {r.mealTypes.map((m) => (
                      <Badge key={m} className="bg-gray-50 text-gray-500 ring-gray-200">
                        {MEAL_LABEL[m]}
                      </Badge>
                    ))}
                    {r.tags.map((t) => (
                      <Badge key={t} className="bg-brand-50 text-brand-700 ring-brand-200">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-gray-500">{r.items.map((i) => `${ing.get(i.ingredientId)?.name ?? "已删除"} ${i.grams}g`).join("、")}</p>
                  <div className="mt-2 text-sm">
                    <b>{fmt(n.kcal)}</b> 千卡 <span className="text-xs text-gray-400">· 蛋白 {fmt(n.proteinG)}g · 脂肪 {fmt(n.fatG)}g · 碳水 {fmt(n.carbG)}g</span>
                  </div>
                  {mine && (r.guideUrl || r.guideNotes) && <p className="mt-1 text-xs text-brand-600">有制作说明</p>}
                  {missing && <p className="mt-1 text-xs text-red-500">含已删除的食材，不会被安排</p>}
                </Card>
              </button>
            );
          })}
        </div>
      )}
      {editing && <RecipeEditor recipe={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const ingredients = useDataStore((s) => s.data.ingredients);
  const ing = useIngredientMap();
  const readonly = Boolean(recipe && !isUserRecipe(recipe));
  const [name, setName] = useState(recipe?.name ?? "");
  const [mealTypes, setMealTypes] = useState<Recipe["mealTypes"]>(recipe?.mealTypes ?? ["lunch", "dinner"]);
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? []);
  const [cookMinutes, setCook] = useState<number | undefined>(recipe?.cookMinutes ?? 20);
  const [items, setItems] = useState<RecipeItem[]>(recipe?.items ?? []);
  const [guideUrl, setGuideUrl] = useState(recipe?.guideUrl ?? "");
  const [guideNotes, setGuideNotes] = useState(recipe?.guideNotes ?? "");
  const [adding, setAdding] = useState("");
  const n = itemsNutrients(items, ing);
  const valid = name.trim() && mealTypes.length > 0 && items.length > 0 && items.every((i) => i.grams > 0);

  const save = async () => {
    if (readonly) return;
    await useDataStore.getState().upsert("recipes", {
      id: recipe?.id ?? generateId(),
      name: name.trim(),
      mealTypes,
      tags,
      cookMinutes: cookMinutes ?? 0,
      items,
      mine: true,
      guideUrl: guideUrl.trim() || undefined,
      guideNotes: guideNotes.trim() || undefined,
    });
    onClose();
  };

  const remove = async () => {
    if (recipe && !readonly && confirm(`确定删除「${recipe.name}」？已经排进计划的餐不受影响。`)) {
      await useDataStore.getState().remove("recipes", recipe.id);
      onClose();
    }
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Modal open onClose={onClose} title={readonly ? "推荐菜单" : recipe ? "编辑菜单" : "新建菜单"} wide>
      {readonly && <p className="mb-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">这是推荐菜，只作为随机抽选池，不会写进「我的菜单」。写进计划后才会拿去算采购量。</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="菜名" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：番茄炒蛋 + 米饭" disabled={readonly} />
        </Field>
        <Field label="烹饪时间（分钟）">
          <NumberInput value={cookMinutes} onChange={setCook} disabled={readonly} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <div>
          <div className="mb-1 text-sm font-medium text-gray-700">适合的餐次</div>
          <div className="flex gap-1">
            {MEAL_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={readonly}
                onClick={() => setMealTypes(toggle(mealTypes, m))}
                className={cn("rounded-full px-3 py-1 text-sm ring-1", mealTypes.includes(m) ? "bg-brand-600 text-white ring-brand-600" : "ring-gray-200", readonly && "opacity-70")}
              >
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-gray-700">标签（影响模式偏好）</div>
          <div className="flex gap-1">
            {TAG_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                disabled={readonly}
                onClick={() => setTags(toggle(tags, t))}
                className={cn("rounded-full px-3 py-1 text-sm ring-1", tags.includes(t) ? "bg-brand-50 text-brand-700 ring-brand-500" : "ring-gray-200", readonly && "opacity-70")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-gray-700">一份的食材用量（可食部克数）</h4>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={item.ingredientId} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{ing.get(item.ingredientId)?.name ?? "已删除食材"}</span>
            <NumberInput
              value={item.grams}
              onChange={(v) => setItems(items.map((x, i) => (i === idx ? { ...x, grams: v ?? 0 } : x)))}
              className="!h-8 w-24"
              disabled={readonly}
            />
            <span className="text-xs text-gray-400">g</span>
            {!readonly && (
              <button className="rounded p-1 text-gray-400 hover:bg-gray-100" onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="移除">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {!readonly && (
          <div className="flex gap-2">
            <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">选择要添加的食材…</option>
              {ingredients
                .filter((i) => !items.some((x) => x.ingredientId === i.id))
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </Select>
            <Button
              variant="secondary"
              disabled={!adding}
              onClick={() => {
                setItems([...items, { ingredientId: adding, grams: 100 }]);
                setAdding("");
              }}
            >
              <Plus size={16} /> 添加
            </Button>
          </div>
        )}
      </div>

      {!readonly && (
        <div className="mt-5 space-y-3">
          <Field label="制作视频或文档" hint="可填 YouTube、B 站、网页链接">
            <Input value={guideUrl} onChange={(e) => setGuideUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="做法记录">
            <textarea
              value={guideNotes}
              onChange={(e) => setGuideNotes(e.target.value)}
              rows={4}
              placeholder="火候、调味、步骤……随便记"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </Field>
        </div>
      )}

      {readonly && (recipe?.guideUrl || recipe?.guideNotes) && (
        <div className="mt-5 space-y-2 rounded-xl bg-gray-50 p-3 text-sm">
          {recipe.guideUrl && (
            <a href={guideHref(recipe.guideUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
              <ExternalLink size={14} /> 打开制作说明
            </a>
          )}
          {recipe.guideNotes && <p className="whitespace-pre-wrap text-gray-600">{recipe.guideNotes}</p>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-gray-50 p-3 text-center text-sm">
        <div>
          <div className="text-xs text-gray-500">热量</div>
          <b>{fmt(n.kcal)} 千卡</b>
        </div>
        <div>
          <div className="text-xs text-gray-500">蛋白质</div>
          <b>{fmt(n.proteinG, 1)} g</b>
        </div>
        <div>
          <div className="text-xs text-gray-500">脂肪</div>
          <b>{fmt(n.fatG, 1)} g</b>
        </div>
        <div>
          <div className="text-xs text-gray-500">碳水</div>
          <b>{fmt(n.carbG, 1)} g</b>
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-400">生成方案时会按目标热量把份量缩放到 0.5–2 倍。</p>

      <div className="mt-5 flex justify-between">
        {recipe && !readonly ? (
          <Button variant="danger" onClick={remove}>
            <Trash2 size={16} /> 删除
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {readonly ? "关闭" : "取消"}
          </Button>
          {!readonly && (
            <Button onClick={save} disabled={!valid}>
              保存
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
