import { describe, expect, it } from "vitest";
import { EPOCH, type Product } from "@/lib/schema/data";
import { findProductByName, reuseProduct, searchProducts } from "./catalog";

const item = (patch: Partial<Product> & Pick<Product, "id" | "name">): Product => ({
  updatedAt: EPOCH,
  repeat: false,
  boughtCount: 0,
  ...patch,
});

describe("product catalog", () => {
  const catalog = [
    item({ id: "a", name: "Lidl Spare Ribs", store: "Lidl", lastBoughtAt: "2026-10-10", boughtCount: 2 }),
    item({ id: "b", name: "全脂牛奶", store: "Aldi", boughtCount: 0 }),
  ];

  it("finds the same product by name ignoring case and spaces", () => {
    expect(findProductByName(catalog, "  lidl   spare ribs ")?.id).toBe("a");
  });

  it("reuses the archive record instead of creating a duplicate", () => {
    const next = reuseProduct(catalog, { id: "new", name: "Lidl Spare Ribs", repeat: true, boughtCount: 0 });
    expect(next.id).toBe("a");
    expect(next.lastBoughtAt).toBe("2026-10-10");
    expect(next.boughtCount).toBe(2);
  });

  it("searches by store or name", () => {
    expect(searchProducts(catalog, "aldi").map((p) => p.id)).toEqual(["b"]);
  });
});
