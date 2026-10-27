"use client";

import { useMemo } from "react";
import { computeTargets } from "@/lib/nutrition/targets";
import { useDataStore } from "@/lib/store/data-store";

export function useData() {
  return useDataStore((s) => s.data);
}

export function useIngredientMap() {
  const ingredients = useDataStore((s) => s.data.ingredients);
  return useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
}

export function useRecipeMap() {
  const recipes = useDataStore((s) => s.data.recipes);
  return useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
}

export function useProductMap() {
  const products = useDataStore((s) => s.data.products);
  return useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
}

export function useTargets() {
  const profile = useDataStore((s) => s.data.profile);
  const logs = useDataStore((s) => s.data.weightLogs);
  return useMemo(() => (profile ? computeTargets(profile, logs) : null), [profile, logs]);
}

export function fmt(n: number, digits = 0) {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtGrams(g: number) {
  return g >= 1000 ? `${fmt(g / 1000, 2)} kg` : `${fmt(g)} g`;
}
