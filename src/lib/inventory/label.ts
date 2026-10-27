import { serveStyle } from "@/lib/food/serve";
import type { Ingredient, InventoryItem, Product } from "@/lib/schema/data";

export function inventoryIngredientId(item: InventoryItem, products: Map<string, Product>): string | undefined {
  return item.ingredientId || (item.productId ? products.get(item.productId)?.ingredientId : undefined);
}

export function stockName(item: Pick<InventoryItem, "productId" | "ingredientId">, products: Map<string, Product>, ingredients: Map<string, Ingredient>): string {
  return (item.productId ? products.get(item.productId)?.name : undefined) ?? (item.ingredientId ? ingredients.get(item.ingredientId)?.name : undefined) ?? "商品";
}

export function stockQtyText(quantityG: number, product?: Product, ingredient?: Ingredient): string {
  const n = Math.max(0, quantityG);
  const fmt = (v: number, d = 0) => v.toLocaleString("zh-CN", { maximumFractionDigits: d });
  const grams = n >= 1000 ? `${fmt(n / 1000, 2)} kg` : `${fmt(n)} g`;
  const style = serveStyle(product, ingredient);
  if (style.unit === "ml") return `${fmt(n)} ml`;
  if (style.unit === "piece") return `${fmt(style.fromGrams(n), 1)} ${style.unitLabel}`;
  const packG = product?.packG;
  if (packG && packG > 0) {
    const packs = n / packG;
    if (packs >= 0.15) return `${fmt(packs, 1)} 包 · ${grams}`;
  }
  return grams;
}
