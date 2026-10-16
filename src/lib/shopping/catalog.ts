import type { Product } from "@/lib/schema/data";

export function normalizeProductName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findProductByName(products: Product[], name: string): Product | undefined {
  const n = normalizeProductName(name);
  if (!n) return undefined;
  return products.find((p) => normalizeProductName(p.name) === n);
}

export function searchProducts(products: Product[], query: string): Product[] {
  const n = normalizeProductName(query);
  const sorted = sortCatalog(products);
  if (!n) return sorted;
  return sorted.filter((p) => {
    const hay = `${normalizeProductName(p.name)} ${normalizeProductName(p.store ?? "")}`;
    return hay.includes(n);
  });
}

/** 最近买过的排最前，方便下次直接翻出来。 */
export function sortCatalog(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const bought = (b.lastBoughtAt ?? "").localeCompare(a.lastBoughtAt ?? "");
    if (bought !== 0) return bought;
    const count = (b.boughtCount ?? 0) - (a.boughtCount ?? 0);
    if (count !== 0) return count;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** 同名商品沿用已有档案，不重复建一条。 */
export function reuseProduct(products: Product[], incoming: Omit<Product, "updatedAt">): Omit<Product, "updatedAt"> {
  const existing = products.find((p) => p.id === incoming.id) ?? findProductByName(products, incoming.name);
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    lastBoughtAt: existing.lastBoughtAt,
    boughtCount: existing.boughtCount,
    image: incoming.image ?? existing.image,
  };
}
