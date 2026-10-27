"use client";

import { Plus, Refrigerator, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, cn, Input, NumberInput } from "@/components/ui";
import { amountLabel, pairingHints, serveStyle, type ServeRole } from "@/lib/food/serve";
import { fmt, useIngredientMap, useProductMap } from "@/lib/hooks";
import { stockQtyText } from "@/lib/inventory/label";
import { itemsNutrients } from "@/lib/nutrition/recipe";
import { CATEGORY_LABEL, type Ingredient, type MealEntry, type Product, type RecipeItem } from "@/lib/schema/data";
import { searchProducts } from "@/lib/shopping/catalog";
import { useDataStore } from "@/lib/store/data-store";

type Line = { key: string; productId?: string; ingredientId: string; grams: number };

function lineKey() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function MealCompose({
  entry,
  onSave,
  onBack,
}: {
  entry: MealEntry;
  onSave: (items: RecipeItem[], name: string, saveRecipe: boolean) => void;
  onBack: () => void;
}) {
  const products = useDataStore((s) => s.data.products);
  const ingredients = useDataStore((s) => s.data.ingredients);
  const inventory = useDataStore((s) => s.data.inventory);
  const ing = useIngredientMap();
  const productMap = useProductMap();
  const [lines, setLines] = useState<Line[]>(() =>
    entry.items.map((item) => ({ key: lineKey(), productId: item.productId, ingredientId: item.ingredientId, grams: item.grams })),
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<ServeRole | null>(null);
  const [saveRecipe, setSaveRecipe] = useState(false);
  const [name, setName] = useState(entry.customName ?? "");

  const remaining = useMemo(() => {
    const map = new Map<string, number>();
    for (const lot of inventory) {
      if (lot.status !== "active" || lot.quantityG <= 0) continue;
      const key = lot.productId ?? lot.ingredientId;
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + lot.quantityG);
    }
    return map;
  }, [inventory]);

  const fridge = useMemo(
    () =>
      inventory
        .filter((i) => i.status === "active" && i.quantityG > 0)
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
        .slice(0, 8),
    [inventory],
  );

  const hits = useMemo(() => {
    const usedP = new Set(lines.map((l) => l.productId).filter(Boolean));
    const usedI = new Set(lines.map((l) => l.ingredientId));
    const productHits = searchProducts(products, query)
      .filter((p) => !usedP.has(p.id))
      .filter((p) => {
        if (!roleFilter) return true;
        return serveStyle(p, p.ingredientId ? ing.get(p.ingredientId) : undefined).role === roleFilter;
      })
      .slice(0, 6);
    const q = query.trim();
    const ingredientHits = ingredients
      .filter((i) => !usedI.has(i.id) && (!q || i.name.includes(q) || CATEGORY_LABEL[i.category].includes(q)))
      .filter((i) => !roleFilter || serveStyle(undefined, i).role === roleFilter)
      .filter((i) => !productHits.some((p) => p.ingredientId === i.id))
      .slice(0, 6);
    return { productHits, ingredientHits };
  }, [products, ingredients, query, lines, roleFilter, ing]);

  const addProduct = (product: Product, grams?: number) => {
    const ingredientId = product.ingredientId;
    if (!ingredientId) return;
    const style = serveStyle(product, ing.get(ingredientId));
    const g = grams ?? style.toGrams(style.defaultAmount);
    setLines((list) => [...list, { key: lineKey(), productId: product.id, ingredientId, grams: g }]);
    setQuery("");
    setRoleFilter(null);
  };

  const addIngredient = (ingredient: Ingredient, grams?: number) => {
    const existing = products.find((p) => p.ingredientId === ingredient.id && p.repeat) ?? products.find((p) => p.ingredientId === ingredient.id);
    if (existing) {
      addProduct(existing, grams);
      return;
    }
    const style = serveStyle(undefined, ingredient);
    setLines((list) => [...list, { key: lineKey(), ingredientId: ingredient.id, grams: grams ?? style.toGrams(style.defaultAmount) }]);
    setQuery("");
    setRoleFilter(null);
  };

  const items: RecipeItem[] = lines.map(({ productId, ingredientId, grams }) => ({ productId, ingredientId, grams }));
  const nutrients = itemsNutrients(items, ing);
  const roles = lines.map((l) => serveStyle(l.productId ? productMap.get(l.productId) : undefined, ing.get(l.ingredientId)).role);
  const hints = pairingHints(roles, entry.mealType);
  const autoName = lines
    .map((l) => {
      const product = l.productId ? productMap.get(l.productId) : undefined;
      const ingredient = ing.get(l.ingredientId);
      return `${product?.name ?? ingredient?.name ?? "食材"} ${amountLabel(l.grams, serveStyle(product, ingredient))}`;
    })
    .join(" + ");

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">从冰箱里拿、搜已买的商品，或从食材库加。牛奶按毫升，肉和菜按克，可以随便配。</p>

      {fridge.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
            <Refrigerator size={12} /> 冰箱里有
          </p>
          <div className="flex flex-wrap gap-1.5">
            {fridge.map((lot) => {
              const product = lot.productId ? productMap.get(lot.productId) : undefined;
              const ingredient = lot.ingredientId ? ing.get(lot.ingredientId) : product?.ingredientId ? ing.get(product.ingredientId) : undefined;
              const label = product?.name ?? ingredient?.name ?? "商品";
              const disabled = Boolean((lot.productId && lines.some((l) => l.productId === lot.productId)) || (ingredient && lines.some((l) => !l.productId && l.ingredientId === ingredient.id)));
              return (
                <button
                  key={lot.id}
                  disabled={disabled}
                  onClick={() => {
                    if (product && product.ingredientId) addProduct(product);
                    else if (ingredient) addIngredient(ingredient);
                  }}
                  className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 ring-1 ring-emerald-100 disabled:opacity-40"
                >
                  {label}
                  <span className="ml-1 text-emerald-600/70">{stockQtyText(lot.quantityG, product, ingredient)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-3 text-gray-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜商品或食材，例如 牛奶、鸡胸、西兰花" className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["protein", "加肉/蛋豆"],
            ["veg", "加蔬菜"],
            ["staple", "加主食"],
            ["drink", "加奶/饮料"],
            ["snack", "加水果零食"],
          ] as const
        ).map(([role, label]) => (
          <button
            key={role}
            onClick={() => setRoleFilter((cur) => (cur === role ? null : role))}
            className={cn("rounded-full px-2.5 py-1 text-xs ring-1", roleFilter === role ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-600 ring-gray-200")}
          >
            <Plus size={10} className="mr-0.5 inline" />
            {label}
          </button>
        ))}
      </div>

      {(query || roleFilter) && (
        <ul className="max-h-40 overflow-y-auto rounded-xl ring-1 ring-gray-100">
          {hits.productHits.map((p) => (
            <li key={p.id}>
              <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => addProduct(p)}>
                <span>
                  {p.name}
                  <span className="ml-2 text-[11px] text-brand-600">商品</span>
                </span>
                <span className="text-xs text-gray-400">{p.packG ? `${p.packG} g/包` : ""}</span>
              </button>
            </li>
          ))}
          {hits.ingredientHits.map((i) => (
            <li key={i.id}>
              <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => addIngredient(i)}>
                <span>
                  {i.name}
                  <span className="ml-2 text-[11px] text-gray-400">{CATEGORY_LABEL[i.category]}</span>
                </span>
                <span className="text-xs text-gray-400">食材库</span>
              </button>
            </li>
          ))}
          {hits.productHits.length === 0 && hits.ingredientHits.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">没有匹配的商品或食材</li>}
        </ul>
      )}

      {lines.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">还没加东西。牛奶可以只倒一杯；炒肉就再加一份蔬菜。</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line) => {
            const product = line.productId ? productMap.get(line.productId) : undefined;
            const ingredient = ing.get(line.ingredientId);
            const style = serveStyle(product, ingredient);
            const amount = style.fromGrams(line.grams);
            const left = remaining.get(line.productId ?? line.ingredientId);
            return (
              <li key={line.key} className="rounded-xl bg-gray-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{product?.name ?? ingredient?.name}</div>
                    <div className="text-[11px] text-gray-400">{style.hint}</div>
                  </div>
                  <button className="text-gray-400 hover:text-red-500" onClick={() => setLines((list) => list.filter((x) => x.key !== line.key))} aria-label="去掉">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {style.chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => setLines((list) => list.map((x) => (x.key === line.key ? { ...x, grams: style.toGrams(chip) } : x)))}
                      className={cn("rounded-full px-2 py-0.5 text-xs ring-1", amount === chip ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-600 ring-gray-200")}
                    >
                      {chip} {style.unitLabel}
                    </button>
                  ))}
                  <NumberInput
                    value={amount}
                    onChange={(v) => {
                      if (v === undefined || v <= 0) return;
                      setLines((list) => list.map((x) => (x.key === line.key ? { ...x, grams: style.toGrams(v) } : x)));
                    }}
                    className="!h-8 w-24"
                  />
                  <span className="text-xs text-gray-500">{style.unitLabel}</span>
                </div>
                {left !== undefined && (
                  <p className={cn("mt-1 text-[11px]", line.grams > left ? "text-amber-600" : "text-gray-400")}>
                    库存还剩 {stockQtyText(left, product, ingredient)}
                    {line.grams > left ? "，这顿会多用掉一些" : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hints.map((h) => (
        <p key={h} className="text-xs text-amber-700">
          {h}
        </p>
      ))}

      {lines.length > 0 && (
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
          约 {fmt(nutrients.kcal)} 千卡 · 蛋白 {fmt(nutrients.proteinG)} g
        </div>
      )}

      <Fieldish label="这餐叫什么（可选）">
        <Input value={name} placeholder={autoName || "例如 牛奶 + 鸡蛋"} onChange={(e) => setName(e.target.value)} />
      </Fieldish>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saveRecipe} onChange={(e) => setSaveRecipe(e.target.checked)} />
        存进「我的菜单」，下次可以直接点
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>
          返回
        </Button>
        <Button disabled={lines.length === 0} onClick={() => onSave(items, name.trim() || autoName, saveRecipe)}>
          用这顿
        </Button>
      </div>
    </div>
  );
}

function Fieldish({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}
