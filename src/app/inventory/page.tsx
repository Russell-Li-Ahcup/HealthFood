"use client";

/* eslint-disable @next/next/no-img-element -- 商品照片是本地压缩后的 data URL */

import { Plus, Snowflake, Trash2, CheckCheck, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, cn, Empty, Field, Input, Modal, NumberInput, PageTitle, Segmented, Select } from "@/components/ui";
import { usableDays } from "@/lib/planner/generate";
import { saveInventoryLot } from "@/lib/actions";
import { addDaysKey, diffDays, formatDay, todayKey, weekStartOf } from "@/lib/dates";
import { serveStyle } from "@/lib/food/serve";
import { fmtGrams, useIngredientMap, useProductMap } from "@/lib/hooks";
import { daysLeft, EXPIRY_STYLE, expiryLevel } from "@/lib/inventory/expiry";
import { stockName, stockQtyText } from "@/lib/inventory/label";
import { generateId, STORAGE_LABEL, type InventoryItem, type Product, type StorageType } from "@/lib/schema/data";
import { searchProducts } from "@/lib/shopping/catalog";
import { useDataStore } from "@/lib/store/data-store";

export default function InventoryPage() {
  const inventory = useDataStore((s) => s.data.inventory);
  const ing = useIngredientMap();
  const products = useProductMap();
  const today = todayKey();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);

  const active = useMemo(() => inventory.filter((i) => i.status === "active" && i.quantityG > 0).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt)), [inventory]);
  const history = useMemo(() => inventory.filter((i) => i.status !== "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50), [inventory]);
  const weekStart = weekStartOf(today);
  const wasted = inventory.filter((i) => i.status === "discarded" && i.updatedAt.slice(0, 10) >= weekStart);
  const wastedG = wasted.reduce((s, i) => s + (i.discardedG ?? 0), 0);
  const counts = { expired: 0, urgent: 0, soon: 0, ok: 0 };
  for (const i of active) counts[expiryLevel(i.expiresAt, today)]++;

  const update = (item: InventoryItem, patch: Partial<InventoryItem>) => void useDataStore.getState().upsert("inventory", { ...item, ...patch });

  return (
    <div className="space-y-4">
      <PageTitle
        title="库存与保质期"
        subtitle="和采购清单一样按商品记。完成采购后自动入库，标记已吃时按到期日先后扣减"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> 手动添加
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="已过期" value={counts.expired} className="text-red-600" />
        <SummaryCard label="1 天内到期" value={counts.urgent} className="text-orange-600" />
        <SummaryCard label="3 天内到期" value={counts.soon} className="text-amber-600" />
        <SummaryCard label="本周浪费" value={wastedG > 0 ? fmtGrams(wastedG) : "0"} className="text-gray-700" />
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: `在库（${active.length}）` },
          { value: "history", label: "历史记录" },
        ]}
      />

      {tab === "active" &&
        (active.length === 0 ? (
          <Empty>库存是空的。完成一次采购，或把家里已有的商品加进来。</Empty>
        ) : (
          <Card className="!p-0">
            <ul className="divide-y divide-gray-50">
              {active.map((item) => {
                const product = item.productId ? products.get(item.productId) : undefined;
                const ingredient = item.ingredientId ? ing.get(item.ingredientId) : product?.ingredientId ? ing.get(product.ingredientId) : undefined;
                const d = daysLeft(item.expiresAt, today);
                const level = expiryLevel(item.expiresAt, today);
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    {product?.image ? (
                      <img src={product.image} alt="" className="h-12 w-12 rounded-xl object-cover bg-gray-100" />
                    ) : null}
                    <div className="min-w-32 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {stockName(item, products, ing)}
                        {item.storage === "freezer" && <Snowflake size={14} className="text-sky-500" />}
                      </div>
                      <div className="text-xs text-gray-400">
                        {STORAGE_LABEL[item.storage]} · {formatDay(item.purchasedAt)} 买入 · {formatDay(item.expiresAt)} 到期
                      </div>
                    </div>
                    <span className="text-sm font-medium">{stockQtyText(item.quantityG, product, ingredient)}</span>
                    <Badge className={EXPIRY_STYLE[level].className}>{EXPIRY_STYLE[level].label(d)}</Badge>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(item)} title="编辑">
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => update(item, { status: "used" })} title="已用完">
                        <CheckCheck size={14} /> 用完
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => update(item, { status: "discarded", discardedG: item.quantityG })} title="丢弃，计入浪费">
                        <Trash2 size={14} /> 丢弃
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}

      {tab === "history" && (
        <Card className="!p-0">
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">暂无记录</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {history.map((item) => (
                <li key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>
                    {stockName(item, products, ing)}
                    <span className="ml-2 text-xs text-gray-400">{formatDay(item.purchasedAt)} 买入</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {item.status === "discarded" ? (
                      <Badge className="bg-red-50 text-red-600 ring-red-100">丢弃 {fmtGrams(item.discardedG ?? 0)}</Badge>
                    ) : (
                      <Badge className="bg-gray-50 text-gray-500 ring-gray-100">已用完</Badge>
                    )}
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => update(item, { status: "active", discardedG: undefined, quantityG: item.quantityG || item.discardedG || 100 })}>
                      恢复
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {editing && <InventoryEditor item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SummaryCard({ label, value, className }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", className)}>{value}</div>
    </div>
  );
}

function InventoryEditor({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const ingredients = useDataStore((s) => s.data.ingredients);
  const catalog = useDataStore((s) => s.data.products);
  const ing = useIngredientMap();
  const today = todayKey();
  const existing = item?.productId ? catalog.find((p) => p.id === item.productId) : undefined;
  const [query, setQuery] = useState(existing?.name ?? "");
  const [product, setProduct] = useState<Product | undefined>(existing);
  const [ingredientId, setIngredientId] = useState(item?.ingredientId ?? existing?.ingredientId ?? "");
  const ingredient = ing.get(ingredientId);
  const style = serveStyle(product, ingredient);
  const [amount, setAmount] = useState<number | undefined>(item ? style.fromGrams(item.quantityG) : style.defaultAmount);
  const [purchasedAt, setPurchasedAt] = useState(item?.purchasedAt ?? today);
  const [storage, setStorage] = useState<StorageType>(item?.storage ?? ingredient?.storage ?? "fridge");
  const autoExpiry = ingredient ? addDaysKey(purchasedAt, storage === "freezer" ? usableDays(ingredient) : ingredient.shelfLifeDays) : addDaysKey(purchasedAt, 7);
  const [expiresAt, setExpiresAt] = useState(item?.expiresAt ?? "");
  const hits = query.trim() ? searchProducts(catalog, query).slice(0, 6) : catalog.slice(0, 6);

  const grams = amount && amount > 0 ? style.toGrams(amount) : 0;
  const pick = (p: Product) => {
    setProduct(p);
    setQuery(p.name);
    setIngredientId(p.ingredientId ?? "");
    const next = serveStyle(p, p.ingredientId ? ing.get(p.ingredientId) : undefined);
    setAmount(next.defaultAmount);
    setStorage(p.ingredientId ? (ing.get(p.ingredientId)?.storage ?? "fridge") : "fridge");
    setExpiresAt("");
  };

  const save = async () => {
    const label = product?.name ?? query.trim();
    if (!label || grams <= 0) return;
    await saveInventoryLot({
      id: item?.id,
      product: {
        id: product?.id ?? generateId(),
        name: label,
        image: product?.image,
        ingredientId: ingredientId || product?.ingredientId,
        packG: product?.packG,
        price: product?.price,
        store: product?.store,
        repeat: product?.repeat ?? true,
        lastBoughtAt: product?.lastBoughtAt,
        boughtCount: product?.boughtCount ?? 0,
      },
      ingredientId: ingredientId || product?.ingredientId,
      quantityG: grams,
      packG: product?.packG,
      purchasedAt,
      expiresAt: expiresAt || autoExpiry,
      storage,
      sourceTripId: item?.sourceTripId,
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={item ? "编辑库存" : "添加库存"}>
      <p className="mb-3 text-sm text-gray-500">记的是买回来的那件商品，和采购清单同一套。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="商品" className="sm:col-span-2">
          <Input value={query} placeholder="搜档案里的商品，或输入新名字" onChange={(e) => setQuery(e.target.value)} />
          {!item && hits.length > 0 && (
            <ul className="mt-2 max-h-36 overflow-y-auto rounded-xl ring-1 ring-gray-100">
              {hits.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => pick(p)}>
                    {p.image ? <img src={p.image} alt="" className="h-8 w-8 rounded-lg object-cover" /> : null}
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field label="对应食材（算营养和保质期）" className="sm:col-span-2">
          <Select
            value={ingredientId}
            onChange={(e) => {
              setIngredientId(e.target.value);
              setStorage(ing.get(e.target.value)?.storage ?? "fridge");
              setExpiresAt("");
            }}
          >
            <option value="">先不对应</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`还剩多少（${style.unitLabel}）`} hint={style.hint}>
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="存放方式">
          <Select
            value={storage}
            onChange={(e) => {
              setStorage(e.target.value as StorageType);
              setExpiresAt("");
            }}
          >
            {Object.entries(STORAGE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="购买日期">
          <Input
            type="date"
            value={purchasedAt}
            onChange={(e) => {
              setPurchasedAt(e.target.value);
              setExpiresAt("");
            }}
          />
        </Field>
        <Field label="到期日期" hint={`按保质期自动推算为 ${autoExpiry}，可手动修改（剩余 ${diffDays(expiresAt || autoExpiry, today)} 天）`}>
          <Input type="date" value={expiresAt || autoExpiry} onChange={(e) => setExpiresAt(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button onClick={() => void save()} disabled={!query.trim() || grams <= 0}>
          保存
        </Button>
      </div>
    </Modal>
  );
}
