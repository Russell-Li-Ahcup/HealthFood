"use client";

import { Plus, Snowflake, Trash2, CheckCheck, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, cn, Empty, Field, Input, Modal, NumberInput, PageTitle, Segmented, Select } from "@/components/ui";
import { usableDays } from "@/lib/planner/generate";
import { addDaysKey, diffDays, formatDay, todayKey, weekStartOf } from "@/lib/dates";
import { fmt, fmtGrams, useIngredientMap } from "@/lib/hooks";
import { daysLeft, EXPIRY_STYLE, expiryLevel } from "@/lib/inventory/expiry";
import { generateId, STORAGE_LABEL, type InventoryItem, type StorageType } from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";

export default function InventoryPage() {
  const inventory = useDataStore((s) => s.data.inventory);
  const ing = useIngredientMap();
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
        subtitle="完成采购后自动入库，标记已吃时按到期日先后自动扣减"
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
          <Empty>库存是空的。完成一次采购，或手动添加家里已有的食材。</Empty>
        ) : (
          <Card className="!p-0">
            <ul className="divide-y divide-gray-50">
              {active.map((item) => {
                const ingredient = ing.get(item.ingredientId);
                const d = daysLeft(item.expiresAt, today);
                const level = expiryLevel(item.expiresAt, today);
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-32 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {ingredient?.name ?? "已删除食材"}
                        {item.storage === "freezer" && <Snowflake size={14} className="text-sky-500" />}
                      </div>
                      <div className="text-xs text-gray-400">
                        {STORAGE_LABEL[item.storage]} · {formatDay(item.purchasedAt)} 买入 · {formatDay(item.expiresAt)} 到期
                      </div>
                    </div>
                    <span className="text-sm font-medium">{fmtGrams(item.quantityG)}</span>
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
                    {ing.get(item.ingredientId)?.name ?? "已删除食材"}
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
  const ing = useIngredientMap();
  const today = todayKey();
  const [ingredientId, setIngredientId] = useState(item?.ingredientId ?? ingredients[0]?.id ?? "");
  const [quantityG, setQuantity] = useState<number | undefined>(item?.quantityG ?? 500);
  const [purchasedAt, setPurchasedAt] = useState(item?.purchasedAt ?? today);
  const ingredient = ing.get(ingredientId);
  const [storage, setStorage] = useState<StorageType>(item?.storage ?? ingredient?.storage ?? "fridge");
  const autoExpiry = ingredient ? addDaysKey(purchasedAt, storage === "freezer" ? usableDays(ingredient) : ingredient.shelfLifeDays) : purchasedAt;
  const [expiresAt, setExpiresAt] = useState(item?.expiresAt ?? "");

  const save = async () => {
    if (!ingredientId || !quantityG) return;
    await useDataStore.getState().upsert("inventory", {
      id: item?.id ?? generateId(),
      ingredientId,
      quantityG,
      purchasedAt,
      expiresAt: expiresAt || autoExpiry,
      storage,
      sourceTripId: item?.sourceTripId,
      status: "active",
    });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={item ? "编辑库存" : "添加库存"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="食材" className="sm:col-span-2">
          <Select
            value={ingredientId}
            onChange={(e) => {
              setIngredientId(e.target.value);
              setStorage(ing.get(e.target.value)?.storage ?? "fridge");
              setExpiresAt("");
            }}
            disabled={Boolean(item)}
          >
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="数量（克，毛重）">
          <NumberInput value={quantityG} onChange={setQuantity} />
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
        <Button onClick={save} disabled={!ingredientId || !quantityG}>
          保存
        </Button>
      </div>
      {ingredient && (
        <p className="mt-2 text-xs text-gray-400">
          {ingredient.name}：{STORAGE_LABEL[ingredient.storage]}保存 {ingredient.shelfLifeDays} 天
          {ingredient.freezable && `，冷冻可存 ${ingredient.frozenShelfLifeDays} 天`}。约 {fmt(quantityG ?? 0)} g。
        </p>
      )}
    </Modal>
  );
}
