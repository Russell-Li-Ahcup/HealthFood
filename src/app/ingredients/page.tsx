"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, cn, Field, Input, Modal, NumberInput, PageTitle, Select } from "@/components/ui";
import { fmt } from "@/lib/hooks";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  generateId,
  PURCHASE_UNITS,
  STORAGE_LABEL,
  type Category,
  type Ingredient,
  type PurchaseUnit,
  type StorageType,
} from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";

export default function IngredientsPage() {
  const ingredients = useDataStore((s) => s.data.ingredients);
  const recipes = useDataStore((s) => s.data.recipes);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [editing, setEditing] = useState<Ingredient | "new" | null>(null);

  const list = useMemo(
    () =>
      ingredients
        .filter((i) => (cat === "all" || i.category === cat) && (!query || i.name.includes(query)))
        .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, "zh")),
    [ingredients, query, cat],
  );

  const remove = async (i: Ingredient) => {
    const used = recipes.filter((r) => r.items.some((x) => x.ingredientId === i.id));
    const msg = used.length > 0 ? `「${i.name}」被 ${used.length} 道菜谱使用（${used.slice(0, 3).map((r) => r.name).join("、")}…），删除后这些菜谱将不会再被安排。确定删除？` : `确定删除「${i.name}」？`;
    if (confirm(msg)) await useDataStore.getState().remove("ingredients", i.id);
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="食材库"
        subtitle="营养按每 100g 可食部填写；采购单位、单位重量和保质期决定采购数量与提醒"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus size={16} /> 添加食材
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input placeholder="搜索食材" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-56" />
        <div className="flex flex-wrap gap-1">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn("rounded-full px-3 py-1 text-xs ring-1", cat === c ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-600 ring-gray-200")}
            >
              {c === "all" ? "全部" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-x-auto !p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">名称</th>
              <th className="px-2 py-2 font-medium">热量</th>
              <th className="px-2 py-2 font-medium">蛋白 / 脂肪 / 碳水</th>
              <th className="px-2 py-2 font-medium">采购单位</th>
              <th className="px-2 py-2 font-medium">保存</th>
              <th className="px-2 py-2 font-medium">单价</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {list.map((i) => (
              <tr key={i.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-2">
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-gray-400">
                    {CATEGORY_LABEL[i.category]}
                    {i.edibleRatio < 1 && ` · 可食部 ${Math.round(i.edibleRatio * 100)}%`}
                  </div>
                </td>
                <td className="px-2 py-2">{i.per100g.kcal} 千卡</td>
                <td className="px-2 py-2 text-gray-600">
                  {i.per100g.proteinG} / {i.per100g.fatG} / {i.per100g.carbG} g
                </td>
                <td className="px-2 py-2">{i.purchaseUnit === "g" ? `按克（最少 ${i.minPurchaseG || 50}g）` : `1 ${i.purchaseUnit} ≈ ${i.unitWeightG}g`}</td>
                <td className="px-2 py-2">
                  <Badge className="bg-gray-50 text-gray-600 ring-gray-200">
                    {STORAGE_LABEL[i.storage]} {i.shelfLifeDays} 天
                  </Badge>
                  {i.freezable && <span className="ml-1 text-xs text-sky-600">可冷冻 {i.frozenShelfLifeDays} 天</span>}
                </td>
                <td className="px-2 py-2 text-gray-600">{i.pricePerUnit !== undefined ? `${fmt(i.pricePerUnit, 1)} 元/${i.purchaseUnit === "g" ? "斤" : i.purchaseUnit}` : "—"}</td>
                <td className="px-2 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
                    <Pencil size={14} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(i)}>
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <p className="p-6 text-center text-sm text-gray-400">没有找到食材</p>}
      </Card>
      {editing && <IngredientEditor item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function IngredientEditor({ item, onClose }: { item: Ingredient | null; onClose: () => void }) {
  const [f, setF] = useState<Omit<Ingredient, "updatedAt">>(
    () =>
      item ?? {
        id: generateId(),
        name: "",
        category: "vegetable",
        per100g: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 },
        edibleRatio: 1,
        purchaseUnit: "g",
        unitWeightG: 1,
        minPurchaseG: 200,
        storage: "fridge",
        shelfLifeDays: 5,
        freezable: false,
      },
  );
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setN = (k: keyof Ingredient["per100g"], v: number | undefined) => setF((x) => ({ ...x, per100g: { ...x.per100g, [k]: v ?? 0 } }));
  const valid = f.name.trim() && f.shelfLifeDays >= 1 && (f.purchaseUnit === "g" || f.unitWeightG > 0);

  const save = async () => {
    await useDataStore.getState().upsert("ingredients", { ...f, name: f.name.trim(), unitWeightG: f.purchaseUnit === "g" ? 1 : f.unitWeightG });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={item ? `编辑：${item.name}` : "添加食材"} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="名称" className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：鸡胸肉" />
        </Field>
        <Field label="类别">
          <Select value={f.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-gray-700">每 100g 可食部的营养</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="热量（千卡）">
          <NumberInput value={f.per100g.kcal} onChange={(v) => setN("kcal", v)} />
        </Field>
        <Field label="蛋白质（g）">
          <NumberInput value={f.per100g.proteinG} onChange={(v) => setN("proteinG", v)} step="0.1" />
        </Field>
        <Field label="脂肪（g）">
          <NumberInput value={f.per100g.fatG} onChange={(v) => setN("fatG", v)} step="0.1" />
        </Field>
        <Field label="碳水（g）">
          <NumberInput value={f.per100g.carbG} onChange={(v) => setN("carbG", v)} step="0.1" />
        </Field>
        <Field label="膳食纤维（g）">
          <NumberInput value={f.per100g.fiberG} onChange={(v) => setN("fiberG", v)} step="0.1" />
        </Field>
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-gray-700">采购</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="采购单位">
          <Select value={f.purchaseUnit} onChange={(e) => set("purchaseUnit", e.target.value as PurchaseUnit)}>
            {PURCHASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u === "g" ? "按克（散装称重）" : `按${u}`}
              </option>
            ))}
          </Select>
        </Field>
        {f.purchaseUnit === "g" ? (
          <Field label="最小采购量（g）">
            <NumberInput value={f.minPurchaseG} onChange={(v) => set("minPurchaseG", v ?? 0)} />
          </Field>
        ) : (
          <Field label={`每${f.purchaseUnit}重量（g）`} hint="例如 1 个鸡蛋约 57g">
            <NumberInput value={f.unitWeightG} onChange={(v) => set("unitWeightG", v ?? 0)} />
          </Field>
        )}
        <Field label={`单价（元/${f.purchaseUnit === "g" ? "斤" : f.purchaseUnit}）`} hint="可选，用于估算花费">
          <NumberInput value={f.pricePerUnit} onChange={(v) => set("pricePerUnit", v)} step="0.1" />
        </Field>
        <Field label="可食部比例" hint="去皮去骨后剩余比例，0.1–1">
          <NumberInput value={f.edibleRatio} onChange={(v) => set("edibleRatio", Math.min(1, Math.max(0.1, v ?? 1)))} step="0.01" />
        </Field>
      </div>

      <h4 className="mb-2 mt-5 text-sm font-semibold text-gray-700">保存与保质期</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="存放方式">
          <Select value={f.storage} onChange={(e) => set("storage", e.target.value as StorageType)}>
            {Object.entries(STORAGE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="保质期（天）">
          <NumberInput value={f.shelfLifeDays} onChange={(v) => set("shelfLifeDays", Math.max(1, Math.round(v ?? 1)))} />
        </Field>
        <Field label="能否冷冻">
          <Select value={f.freezable ? "1" : "0"} onChange={(e) => set("freezable", e.target.value === "1")} disabled={f.storage === "freezer"}>
            <option value="0">不适合冷冻</option>
            <option value="1">可以冷冻</option>
          </Select>
        </Field>
        {f.freezable && f.storage !== "freezer" && (
          <Field label="冷冻保质期（天）">
            <NumberInput value={f.frozenShelfLifeDays} onChange={(v) => set("frozenShelfLifeDays", v ? Math.round(v) : undefined)} />
          </Field>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button onClick={save} disabled={!valid}>
          保存
        </Button>
      </div>
    </Modal>
  );
}
