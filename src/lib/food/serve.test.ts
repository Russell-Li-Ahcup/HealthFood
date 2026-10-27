import { describe, expect, it } from "vitest";
import { EPOCH, type Ingredient, type Product } from "@/lib/schema/data";
import { amountLabel, pairingHints, serveStyle } from "./serve";

const milk: Ingredient = {
  id: "milk",
  updatedAt: EPOCH,
  name: "纯牛奶",
  category: "dairy",
  per100g: { kcal: 65, proteinG: 3, fatG: 3.6, carbG: 5, fiberG: 0 },
  edibleRatio: 1,
  purchaseUnit: "盒",
  unitWeightG: 250,
  minPurchaseG: 0,
  storage: "room",
  shelfLifeDays: 90,
  freezable: false,
};

const chicken: Ingredient = {
  ...milk,
  id: "chicken",
  name: "鸡胸肉",
  category: "meat",
  purchaseUnit: "g",
  unitWeightG: 1,
  storage: "fridge",
  shelfLifeDays: 2,
  freezable: false,
};

describe("serveStyle", () => {
  it("lets milk be poured in millilitres", () => {
    const style = serveStyle(undefined, milk);
    expect(style.unit).toBe("ml");
    expect(style.toGrams(250)).toBe(250);
    expect(amountLabel(250, style)).toBe("250 ml");
  });

  it("weighs meat in grams and asks for vegetables", () => {
    const style = serveStyle(undefined, chicken);
    expect(style.unit).toBe("g");
    expect(style.role).toBe("protein");
    expect(pairingHints(["protein"], "lunch")).toEqual(expect.arrayContaining([expect.stringContaining("蔬菜")]));
  });
});

describe("pairingHints", () => {
  it("allows a drink-only snack without warning about being a main meal", () => {
    expect(pairingHints(["drink"], "snack")).toEqual([]);
  });

  const product: Product = { id: "p", name: "Lidl 牛奶", ingredientId: "milk", packG: 1000, repeat: true, boughtCount: 0, updatedAt: EPOCH };
  it("treats a milk carton as pourable", () => {
    expect(serveStyle(product, milk).unit).toBe("ml");
  });
});
