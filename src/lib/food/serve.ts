import type { Category, Ingredient, Product, PurchaseUnit } from "@/lib/schema/data";

export type ServeRole = "protein" | "veg" | "staple" | "drink" | "count" | "snack" | "other";
export type ServeUnit = "g" | "ml" | "piece" | "pack";

export interface ServeStyle {
  unit: ServeUnit;
  unitLabel: string;
  role: ServeRole;
  defaultAmount: number;
  chips: number[];
  hint: string;
  toGrams: (amount: number) => number;
  fromGrams: (grams: number) => number;
}

const POUR_UNITS = new Set<PurchaseUnit | string>(["盒", "瓶", "袋"]);
const COUNT_UNITS = new Set<PurchaseUnit | string>(["个", "根", "把"]);

function isPourDrink(name: string, cat?: Category, unit?: string) {
  if (cat === "oil") return true;
  if (/酸奶/.test(name) && !/饮|饮料/.test(name)) return false;
  if (/牛奶|纯奶|豆浆|果汁|饮料|牛乳/.test(name)) return true;
  if (cat === "dairy" && POUR_UNITS.has(unit ?? "")) return true;
  return false;
}

export function serveStyle(product?: Product, ingredient?: Ingredient): ServeStyle {
  const name = `${product?.name ?? ""} ${ingredient?.name ?? ""}`;
  const cat = ingredient?.category;
  const purchaseUnit = ingredient?.purchaseUnit;
  const packG = product?.packG;
  const unitW = ingredient?.unitWeightG || 1;

  if (isPourDrink(name, cat, purchaseUnit)) {
    const oil = cat === "oil";
    return {
      unit: "ml",
      unitLabel: "ml",
      role: oil ? "other" : "drink",
      defaultAmount: oil ? 10 : 250,
      chips: oil ? [5, 10, 15, 20] : [100, 200, 250, 330, 500],
      hint: oil ? "按毫升倒，大约 1 ml ≈ 1 g" : "想喝多少毫升就填多少，1 ml ≈ 1 g",
      toGrams: (n) => Math.max(1, Math.round(n)),
      fromGrams: (g) => g,
    };
  }

  if (cat === "egg" || (cat !== "vegetable" && cat !== "leafy" && COUNT_UNITS.has(purchaseUnit ?? "") && unitW >= 30 && unitW <= 80)) {
    const label = purchaseUnit && purchaseUnit !== "g" ? purchaseUnit : "个";
    return {
      unit: "piece",
      unitLabel: label,
      role: "count",
      defaultAmount: 1,
      chips: [1, 2, 3, 4],
      hint: `按${label}计，一个大约 ${unitW} g`,
      toGrams: (n) => Math.max(1, Math.round(n * unitW)),
      fromGrams: (g) => Math.max(1, Math.round(g / unitW)),
    };
  }

  if (cat === "fruit" && COUNT_UNITS.has(purchaseUnit ?? "")) {
    const label = purchaseUnit ?? "个";
    return {
      unit: "piece",
      unitLabel: label,
      role: "snack",
      defaultAmount: 1,
      chips: [1, 2, 3],
      hint: `按${label}计，一个大约 ${unitW} g`,
      toGrams: (n) => Math.max(1, Math.round(n * unitW)),
      fromGrams: (g) => Math.max(1, Math.round(g / unitW)),
    };
  }

  const role: ServeRole =
    cat === "meat" || cat === "seafood" || cat === "bean"
      ? "protein"
      : cat === "vegetable" || cat === "leafy"
        ? "veg"
        : cat === "grain"
          ? "staple"
          : cat === "nut" || cat === "fruit"
            ? "snack"
            : cat === "dairy"
              ? "drink"
              : "other";

  if (role === "protein") {
    return {
      unit: "g",
      unitLabel: "g",
      role,
      defaultAmount: 150,
      chips: [50, 100, 150, 200, 250],
      hint: "按要吃的克数。肉类一般再配蔬菜。",
      toGrams: (n) => Math.max(5, Math.round(n)),
      fromGrams: (g) => g,
    };
  }
  if (role === "veg") {
    return {
      unit: "g",
      unitLabel: "g",
      role,
      defaultAmount: 200,
      chips: [80, 150, 200, 300],
      hint: "大概估一把就行。",
      toGrams: (n) => Math.max(5, Math.round(n)),
      fromGrams: (g) => g,
    };
  }
  if (role === "staple") {
    return {
      unit: "g",
      unitLabel: "g",
      role,
      defaultAmount: 75,
      chips: [50, 75, 100, 150],
      hint: "按生重。一碗米饭大约 75–100 g 米。",
      toGrams: (n) => Math.max(5, Math.round(n)),
      fromGrams: (g) => g,
    };
  }

  const chips = packG ? [...new Set([Math.round(packG / 2), packG, packG * 2].filter((x) => x >= 20))] : [20, 50, 100, 150];
  return {
    unit: "g",
    unitLabel: "g",
    role,
    defaultAmount: packG ? Math.min(packG, role === "drink" ? packG : 100) : 50,
    chips,
    hint: packG ? `一包 ${packG} g，可以吃半包或整包` : "按克填写",
    toGrams: (n) => Math.max(1, Math.round(n)),
    fromGrams: (g) => g,
  };
}

export function pairingHints(roles: ServeRole[], mealType: string): string[] {
  const protein = roles.includes("protein");
  const veg = roles.includes("veg");
  const staple = roles.includes("staple");
  const drink = roles.includes("drink");
  const snack = roles.includes("snack");
  const hints: string[] = [];
  if (protein && !veg) hints.push("肉类最好再加一份蔬菜。");
  if (protein && !staple && (mealType === "lunch" || mealType === "dinner")) hints.push("正餐可以再加主食（米、面、馒头）。");
  if (drink && !protein && !veg && (mealType === "lunch" || mealType === "dinner")) hints.push("这顿只有饮料。加餐这样喝没问题，当正餐的话建议再加点东西。");
  if (roles.length === 1 && snack && (mealType === "lunch" || mealType === "dinner")) hints.push("正餐只有水果或零食，营养会偏少。");
  return hints;
}

export function amountLabel(grams: number, style: ServeStyle): string {
  const amount = style.fromGrams(grams);
  if (style.unit === "ml") return `${Math.round(amount)} ml`;
  if (style.unit === "piece") return `${amount} ${style.unitLabel}`;
  if (style.unit === "pack") return `${amount} 包`;
  return `${Math.round(amount)} g`;
}
