"use client";

/* eslint-disable @next/next/no-img-element -- 商品照片是本地压缩后的 data URL */

import { Camera, Check, ClipboardCopy, Heart, ImagePlus, Minus, PackageCheck, Plus, Refrigerator, Settings2, Snowflake, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { StorageSpaceEditor } from "@/components/settings-editors";
import { Badge, Button, Card, cn, Empty, Field, Input, Modal, NumberInput, PageTitle, Select } from "@/components/ui";
import { addProductToList, assignProduct, completeTrip, deleteProduct, itemKey, refreshTrips, removeListItem, reopenTrip, saveProduct, setItemFreeze, setPackCount, toggleProductRepeat, toggleTripItem } from "@/lib/actions";
import { diffDays, formatDay, formatDayWeek, todayKey } from "@/lib/dates";
import { fmt, fmtGrams, useIngredientMap } from "@/lib/hooks";
import { compressImage } from "@/lib/image";
import { CATEGORY_LABEL, FRIDGE_SLOT_LABEL, FRIDGE_SLOTS, generateId, type Ingredient, type Product, type ShoppingItem, type ShoppingTrip } from "@/lib/schema/data";
import { findProductByName, searchProducts } from "@/lib/shopping/catalog";
import { tripTotal, uncoveredNeeds } from "@/lib/shopping/demand";
import { evaluateTripStorage, overflowHint, slotFor, storageSpaceOf } from "@/lib/shopping/storage";
import { useDataStore } from "@/lib/store/data-store";

function qtyText(item: ShoppingItem, product?: Product) {
  const packG = product?.packG ?? item.packG;
  if (packG) return `${item.buyQty} 包 × ${fmtGrams(packG)}`;
  return `${item.buyQty} 件`;
}

function tripText(trip: ShoppingTrip, ing: Map<string, Ingredient>, products: Map<string, Product>) {
  const lines = [`【采购清单】${formatDayWeek(trip.date)}`];
  for (const i of trip.items) {
    const product = i.productId ? products.get(i.productId) : undefined;
    const name = product?.name ?? ing.get(i.ingredientId ?? "")?.name ?? "商品";
    const slot = slotFor(i.ingredientId ? ing.get(i.ingredientId) : undefined, i.freeze);
    lines.push(`□ ${name} ${qtyText(i, product)}（${FRIDGE_SLOT_LABEL[slot]}）`);
  }
  const total = tripTotal(trip);
  if (total > 0) lines.push(`\n预计花费约 ${fmt(total)} 元`);
  return lines.join("\n");
}

export default function ShoppingPage() {
  const trips = useDataStore((s) => s.data.shoppingTrips);
  const productList = useDataStore((s) => s.data.products);
  const entries = useDataStore((s) => s.data.mealEntries);
  const inventory = useDataStore((s) => s.data.inventory);
  const ingredients = useDataStore((s) => s.data.ingredients);
  const settings = useDataStore((s) => s.data.settings);
  const ing = useIngredientMap();
  const products = useMemo(() => new Map(productList.map((p) => [p.id, p])), [productList]);
  const space = storageSpaceOf(settings);
  const today = todayKey();
  const [completing, setCompleting] = useState<ShoppingTrip | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [forNeed, setForNeed] = useState<{ tripId: string; ingredientId: string } | null>(null);

  useEffect(() => {
    void refreshTrips();
  }, []);

  const open = useMemo(
    () =>
      [...trips.filter((t) => t.status === "planned")].sort((a, b) =>
        a.date >= today && b.date >= today ? a.date.localeCompare(b.date) : a.date >= today ? -1 : b.date >= today ? 1 : b.date.localeCompare(a.date),
      ),
    [trips, today],
  );
  const done = useMemo(() => trips.filter((t) => t.status === "done").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [trips]);
  const current = open[0];
  const onList = new Set((current?.items ?? []).map((i) => i.productId).filter(Boolean));

  const copy = async (trip: ShoppingTrip) => {
    await navigator.clipboard.writeText(tripText(trip, ing, products));
    setCopied(trip.id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="采购清单"
        subtitle="清单和库存记的是同一件商品。先排出到下次采购前的菜，再决定买几包；买完入库后，菜单里自己配餐也能直接从冰箱拿。"
        action={
          <div className="flex gap-2">
            <Link href="/settings">
              <Button variant="secondary">
                <Settings2 size={16} /> 采购日
              </Button>
            </Link>
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} /> 添加商品
            </Button>
          </div>
        }
      />

      <QuickAdd currentTripId={current?.id} />

      <FridgeSpaceCard current={current} ingredients={ing} products={products} />

      {open.length === 0 && (
        <Empty
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus size={16} /> 添加第一件商品
            </Button>
          }
        >
          清单还是空的。直接写下完整商品名，也可以拍一张包装照片。
        </Empty>
      )}

      {open.map((trip) => {
        const days = diffDays(trip.date, today);
        const checked = trip.items.filter((i) => i.checked).length;
        const total = tripTotal(trip);
        const missing = uncoveredNeeds(trip, entries, ingredients, inventory, productList, today);
        return (
          <Card
            key={trip.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {formatDayWeek(trip.date)}
                <Badge className={days < 0 ? "bg-red-50 text-red-600 ring-red-200" : days === 0 ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-gray-50 text-gray-600 ring-gray-200"}>
                  {days < 0 ? `已过 ${-days} 天` : days === 0 ? "今天" : `${days} 天后`}
                </Badge>
              </span>
            }
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(trip)}>
                  {copied === trip.id ? <Check size={14} /> : <ClipboardCopy size={14} />} {copied === trip.id ? "已复制" : "复制"}
                </Button>
                <Button size="sm" onClick={() => setCompleting(trip)} disabled={trip.items.length === 0}>
                  <PackageCheck size={14} /> 完成采购
                </Button>
              </div>
            }
          >
            <p className="mb-3 text-xs text-gray-500">
              {trip.items.length} 件商品 · 已勾选 {checked}
              {total > 0 && ` · 预计 ${fmt(total)} 元`}
            </p>
            {trip.items.length === 0 ? (
              <p className="text-sm text-gray-400">还没有商品。用上面的输入框添加，或从常买里点进来。</p>
            ) : (
              <TripItems
                trip={trip}
                ingredients={ing}
                products={products}
                space={space}
                onEditProduct={(p) => setEditing(p)}
              />
            )}
            {missing.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2">
                <p className="text-xs font-medium text-amber-800">计划里的菜还缺这些原材料，点一下做成整包商品加进清单</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missing.slice(0, 12).map((n) => (
                    <button
                      key={n.ingredientId}
                      className="rounded-full bg-white px-2.5 py-1 text-xs text-amber-900 ring-1 ring-amber-200"
                      onClick={() => setForNeed({ tripId: trip.id, ingredientId: n.ingredientId })}
                    >
                      {ing.get(n.ingredientId)?.name ?? "食材"} · 约 {fmtGrams(n.needG)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <ProductArchive
        products={productList}
        onList={onList}
        onAdd={(p) => void addProductToList(p, current?.id)}
        onEdit={(p) => setEditing(p)}
      />

      {done.length > 0 && (
        <Card title="已完成的采购">
          <ul className="divide-y divide-gray-50">
            {done.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {formatDayWeek(t.date)} · {t.items.length} 件{tripTotal(t) > 0 && ` · 约 ${fmt(tripTotal(t))} 元`}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void reopenTrip(t.id)}>
                  <Undo2 size={14} /> 撤销
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {completing && <CompleteTripModal trip={completing} products={products} onClose={() => setCompleting(null)} />}
      {(editing || forNeed) && (
        <ProductForm
          product={editing && editing !== "new" ? editing : undefined}
          ingredientId={forNeed?.ingredientId}
          ingredients={ingredients}
          onClose={() => {
            setEditing(null);
            setForNeed(null);
          }}
          onSave={async (product) => {
            if (forNeed) await assignProduct(forNeed.tripId, forNeed.ingredientId, product);
            else if (editing && editing !== "new") await saveProduct(product);
            else await addProductToList(product, current?.id);
            setEditing(null);
            setForNeed(null);
          }}
          onDelete={
            editing && editing !== "new"
              ? async () => {
                  await deleteProduct(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function FridgeSpaceCard({
  current,
  ingredients,
  products,
}: {
  current?: ShoppingTrip;
  ingredients: Map<string, Ingredient>;
  products: Map<string, Product>;
}) {
  const settings = useDataStore((s) => s.data.settings);
  const space = storageSpaceOf(settings);
  const fit = current ? evaluateTripStorage(current, ingredients, products, space) : undefined;
  const occupancy = fit ? Object.fromEntries(fit.bySlot.map((s) => [s.slot, s.need] as const)) : undefined;
  const hint = fit ? overflowHint(fit) : undefined;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Refrigerator size={16} className="text-brand-600" />
          冰箱大概还能放多少
        </span>
      }
    >
      {hint && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert size={12} className="mr-1 inline" />
          {hint}
        </p>
      )}
      <StorageSpaceEditor
        value={space}
        occupancy={occupancy}
        onChange={(storageSpace) => void useDataStore.getState().setSettings({ storageSpace })}
      />
    </Card>
  );
}

function TripItems({
  trip,
  ingredients,
  products,
  space,
  onEditProduct,
}: {
  trip: ShoppingTrip;
  ingredients: Map<string, Ingredient>;
  products: Map<string, Product>;
  space: ReturnType<typeof storageSpaceOf>;
  onEditProduct: (p: Product) => void;
}) {
  const fit = evaluateTripStorage(trip, ingredients, products, space);
  const groups = FRIDGE_SLOTS.map((slot) => ({
    slot,
    meta: fit.bySlot.find((s) => s.slot === slot)!,
    placed: fit.placed.filter((p) => p.slot === slot),
  })).filter((g) => g.placed.length > 0);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.slot}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-800">{FRIDGE_SLOT_LABEL[group.slot]}</span>
            <span className={cn("text-xs", group.meta.overflow > 0 ? "font-medium text-amber-700" : "text-gray-400")}>
              约 {group.meta.need} 份{group.meta.overflow > 0 ? ` · 估还能放 ${group.meta.room} 份` : ""}
            </span>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.placed.map((placed) => {
              const i = placed.item;
              const product = i.productId ? products.get(i.productId) : undefined;
              const key = itemKey(i);
              return (
                <li key={key} className={cn("flex gap-3 rounded-2xl p-2 ring-1 ring-gray-100", i.checked && "opacity-60")}>
                  <button onClick={() => product && onEditProduct(product)} className="shrink-0">
                    <ProductPhoto src={product?.image} name={product?.name ?? "商品"} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => void toggleTripItem(trip.id, key)}
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          i.checked ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300",
                        )}
                      >
                        {i.checked && <Check size={12} />}
                      </button>
                      <button className="min-w-0 text-left" onClick={() => product && onEditProduct(product)}>
                        <div className={cn("text-sm font-medium", i.checked && "line-through")}>{product?.name ?? ingredients.get(i.ingredientId ?? "")?.name ?? "商品"}</div>
                        <div className="text-xs text-gray-400">
                          {[product?.store, qtyText(i, product), i.estPrice !== undefined ? `≈${fmt(i.estPrice, 1)}元` : ""].filter(Boolean).join(" · ")}
                        </div>
                      </button>
                      <button className="ml-auto text-gray-300 hover:text-red-500" onClick={() => void removeListItem(trip.id, key)} title="只从本次清单拿掉，商品档案还在" aria-label="从本次清单拿掉">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <button className="rounded-md border border-gray-200 p-1" onClick={() => void setPackCount(trip.id, key, i.buyQty - 1)} disabled={i.buyQty <= 1}>
                        <Minus size={12} />
                      </button>
                      <span className="w-10 text-center text-xs">{i.buyQty}</span>
                      <button className="rounded-md border border-gray-200 p-1" onClick={() => void setPackCount(trip.id, key, i.buyQty + 1)}>
                        <Plus size={12} />
                      </button>
                      {product && (
                        <button
                          className={cn("ml-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs", product.repeat ? "text-rose-600" : "text-gray-400")}
                          onClick={() => void toggleProductRepeat(product.id)}
                        >
                          <Heart size={12} fill={product.repeat ? "currentColor" : "none"} /> {product.repeat ? "已收藏" : "下次还买"}
                        </button>
                      )}
                    </div>
                    {i.warning && (
                      <span className={cn("mt-1 flex items-center gap-1 text-xs", i.freeze ? "text-sky-600" : "text-amber-600")}>
                        {i.freeze ? <Snowflake size={11} /> : <TriangleAlert size={11} />}
                        {i.warning}
                      </span>
                    )}
                    {placed.suggestFreeze && !i.freeze && (
                      <button
                        className="mt-1 flex items-center gap-1 text-xs text-sky-600 hover:underline"
                        onClick={() => void setItemFreeze(trip.id, key, true)}
                      >
                        <Snowflake size={11} /> 冰箱有点满，改放冷冻
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

async function pickCompressedPhoto(file: File | undefined, onOk: (url: string) => void) {
  if (!file) return;
  try {
    onOk(await compressImage(file));
  } catch (error) {
    alert(error instanceof Error ? error.message : "照片压缩失败");
  }
}

function ProductPhoto({ src, name, large }: { src?: string; name: string; large?: boolean }) {
  const size = large ? "h-28 w-full" : "h-16 w-16";
  if (src) return <img src={src} alt={name} className={cn(size, "rounded-xl object-cover bg-gray-100")} />;
  return (
    <div className={cn(size, "flex items-center justify-center rounded-xl bg-gray-100 text-gray-400")}>
      <ImagePlus size={large ? 28 : 18} />
    </div>
  );
}

function QuickAdd({ currentTripId }: { currentTripId?: string }) {
  const catalog = useDataStore((s) => s.data.products);
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hits = name.trim() ? searchProducts(catalog, name).slice(0, 6) : [];
  const exact = findProductByName(catalog, name);
  const add = async (product?: Product) => {
    const chosen = product ?? exact;
    const label = chosen?.name ?? name.trim();
    if (!label) return;
    setBusy(true);
    try {
      await addProductToList(chosen ?? { id: generateId(), name: label, image, repeat: true, boughtCount: 0 }, currentTripId);
      setName("");
      setImage(undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gray-100 text-gray-400 hover:bg-gray-200"
          title="拍包装照片"
        >
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Camera size={20} className="mx-auto" />}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async (e) => {
            await pickCompressedPhoto(e.target.files?.[0], setImage);
            e.target.value = "";
          }}
        />
        <Input
          value={name}
          placeholder="搜已有商品，或输入新名字加入清单"
          className="min-w-0 flex-1"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void add()}
        />
        <Button disabled={busy || !name.trim()} onClick={() => void add()}>
          <Plus size={16} /> {exact ? "用这件" : "加入清单"}
        </Button>
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-gray-50 rounded-xl ring-1 ring-gray-100">
          {hits.map((p) => (
            <li key={p.id}>
              <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50" onClick={() => void add(p)}>
                <ProductPhoto src={p.image} name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-gray-400">{productMeta(p)}</span>
                </span>
                <span className="text-xs text-brand-600">加入清单</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-gray-400">输入已有名称会直接用档案里的那一件，不会重复新建。包装照会自动压到约 20KB，方便同步。</p>
    </Card>
  );
}

function productMeta(p: Product) {
  return [
    p.store,
    p.packG ? `${fmtGrams(p.packG)}/包` : "",
    p.lastBoughtAt ? `上次 ${formatDay(p.lastBoughtAt)}` : "还没买过",
    p.boughtCount ? `买过 ${p.boughtCount} 次` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function ProductArchive({
  products,
  onList,
  onAdd,
  onEdit,
}: {
  products: Product[];
  onList: Set<string | undefined>;
  onAdd: (p: Product) => void;
  onEdit: (p: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const list = searchProducts(products, query);
  return (
    <Card title="商品档案" action={<span className="text-xs text-gray-400">长期保存，下次直接翻出来用</span>}>
      {products.length === 0 ? (
        <p className="text-sm text-gray-400">还没有商品档案。第一次买的时候加上名字和照片，以后都会留在这里。</p>
      ) : (
        <>
          <Input value={query} placeholder="按名称或商店搜索" className="mb-3" onChange={(e) => setQuery(e.target.value)} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {list.map((p) => {
              const already = onList.has(p.id);
              return (
                <li key={p.id} className="rounded-2xl ring-1 ring-gray-100">
                  <button className="w-full p-2 text-left hover:bg-gray-50" onClick={() => (already ? onEdit(p) : onAdd(p))}>
                    <ProductPhoto src={p.image} name={p.name} large />
                    <div className="mt-2 truncate text-sm font-medium">{p.name}</div>
                    <div className="truncate text-xs text-gray-400">{productMeta(p)}</div>
                    <div className="mt-1 text-xs font-medium text-brand-600">{already ? "已在本次清单" : "加入本次清单"}</div>
                  </button>
                </li>
              );
            })}
          </ul>
          {list.length === 0 && <p className="text-sm text-gray-400">档案里没有叫这个名字的商品。</p>}
        </>
      )}
    </Card>
  );
}

function ProductForm({
  product,
  ingredientId,
  ingredients,
  onClose,
  onSave,
  onDelete,
}: {
  product?: Product;
  ingredientId?: string;
  ingredients: Ingredient[];
  onClose: () => void;
  onSave: (product: Omit<Product, "updatedAt">) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const preset = ingredientId ? ingredients.find((i) => i.id === ingredientId) : undefined;
  const [name, setName] = useState(product?.name ?? (preset ? `${preset.name}` : ""));
  const [image, setImage] = useState(product?.image);
  const [packG, setPackG] = useState<number | undefined>(product?.packG ?? 400);
  const [price, setPrice] = useState<number | undefined>(product?.price);
  const [storeName, setStoreName] = useState(product?.store ?? "");
  const [ingId, setIngId] = useState(product?.ingredientId ?? ingredientId ?? "");
  const [repeat, setRepeat] = useState(product?.repeat ?? true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal open onClose={onClose} title={product ? "编辑商品" : "添加商品"}>
      <button type="button" onClick={() => fileRef.current?.click()} className="mb-3 w-full overflow-hidden rounded-2xl bg-gray-100">
        {image ? (
          <img src={image} alt="" className="h-40 w-full object-cover" />
        ) : (
          <div className="flex h-32 flex-col items-center justify-center gap-1 text-gray-400">
            <Camera size={28} />
            <span className="text-xs">拍包装照片或从相册选（自动压缩）</span>
          </div>
        )}
      </button>
      {image && (
        <button className="mb-3 flex items-center gap-1 text-xs text-gray-400" onClick={() => setImage(undefined)}>
          <X size={12} /> 去掉照片
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          await pickCompressedPhoto(e.target.files?.[0], setImage);
          e.target.value = "";
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="完整商品名" className="col-span-2">
          <Input value={name} placeholder="例如 Lidl Spare Ribs" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="一包多少克" hint="整包，拆不开就按这个买">
          <NumberInput value={packG} onChange={setPackG} />
        </Field>
        <Field label="一包价格（元）">
          <NumberInput value={price} onChange={setPrice} step="0.1" />
        </Field>
        <Field label="在哪买" className="col-span-2">
          <Input value={storeName} placeholder="例如 Lidl" onChange={(e) => setStoreName(e.target.value)} />
        </Field>
        <Field label="对应食材（可选）" hint="选了完成采购后会入库" className="col-span-2">
          <Select value={ingId} onChange={(e) => setIngId(e.target.value)}>
            <option value="">不对应食材</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {CATEGORY_LABEL[i.category]} · {i.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
        好吃，下次还买这件
      </label>
      <div className="mt-4 flex justify-end gap-2">
        {onDelete && (
          <Button variant="danger" className="mr-auto" onClick={() => void onDelete()}>
            从档案删除
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                id: product?.id ?? generateId(),
                name: name.trim(),
                image,
                packG,
                price,
                store: storeName.trim() || undefined,
                ingredientId: ingId || undefined,
                repeat,
                lastBoughtAt: product?.lastBoughtAt,
                boughtCount: product?.boughtCount ?? 0,
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          保存
        </Button>
      </div>
    </Modal>
  );
}

function CompleteTripModal({ trip, products, onClose }: { trip: ShoppingTrip; products: Map<string, Product>; onClose: () => void }) {
  const ing = useIngredientMap();
  const [items, setItems] = useState<ShoppingItem[]>(() => trip.items.map((i) => ({ ...i })));
  const [date, setDate] = useState(() => (trip.date > todayKey() ? todayKey() : trip.date));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="完成采购" wide>
      <p className="mb-3 text-sm text-gray-500">核对实际买到的包数（没买的填 0）。对应了食材的会写入库存，标签是建议放的位置。</p>
      <Field label="采购日期" className="mb-3 max-w-48">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {items.map((i) => {
          const product = i.productId ? products.get(i.productId) : undefined;
          return (
            <div key={itemKey(i)} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <ProductPhoto src={product?.image} name={product?.name ?? ""} />
              <span className="flex-1 text-sm">
                {product?.name ?? "商品"}
                <span className="ml-2 text-xs text-gray-400">{FRIDGE_SLOT_LABEL[slotFor(i.ingredientId ? ing.get(i.ingredientId) : undefined, i.freeze)]}</span>
              </span>
              <NumberInput
                value={i.buyQty}
                onChange={(v) =>
                  setItems((list) =>
                    list.map((x) => {
                      if (itemKey(x) !== itemKey(i)) return x;
                      const buyQty = v ?? 0;
                      const packG = x.packG ?? product?.packG;
                      return { ...x, buyQty, buyG: packG ? buyQty * packG : 0 };
                    }),
                  )
                }
                className="!h-8 w-24"
              />
              <span className="w-10 text-xs text-gray-500">{i.packG || product?.packG ? "包" : "件"}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await completeTrip(trip.id, items, date);
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          确认买完
        </Button>
      </div>
    </Modal>
  );
}
