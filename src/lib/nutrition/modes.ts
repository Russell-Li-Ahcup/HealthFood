import type { MealType, Mode } from "@/lib/schema/data";

export interface ScoreWeights {
  macro: number;
  variety: number;
  expiry: number;
  density: number;
  tags: number;
  foodGroup: number;
  diversity: number;
}

export interface ModeConfig {
  label: string;
  short: string;
  suitable: string;
  description: string;
  proteinPerKg: number;
  fatRatio: number;
  surplusKcal: { steady: number; fast: number };
  defaultMealsPerDay: 3 | 4 | 5;
  preferTags: string[];
  weights: ScoreWeights;
  adjustRange: [number, number];
}

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  gain: {
    label: "增重模式",
    short: "增重",
    suitable: "BMI 偏低、想长肉或增肌的人",
    description: "每天比消耗多吃 300–500 千卡，高蛋白、多餐次，优先热量密度高的菜品，按体重趋势自动调整。",
    proteinPerKg: 1.8,
    fatRatio: 0.28,
    surplusKcal: { steady: 300, fast: 500 },
    defaultMealsPerDay: 4,
    preferTags: ["增重友好"],
    weights: { macro: 1, variety: 0.6, expiry: 0.8, density: 0.6, tags: 0.4, foodGroup: 0.15, diversity: 0.1 },
    adjustRange: [-300, 600],
  },
  maintain: {
    label: "健康保持模式",
    short: "保持",
    suitable: "体重正常、想吃得均衡并保持体重的人",
    description: "按日常消耗吃，参考《中国居民膳食指南（2022）》搭配蔬果肉蛋奶，追求食材多样，体重偏离时自动微调。",
    proteinPerKg: 1.2,
    fatRatio: 0.25,
    surplusKcal: { steady: 0, fast: 0 },
    defaultMealsPerDay: 3,
    preferTags: ["清淡", "高纤维"],
    weights: { macro: 1, variety: 0.6, expiry: 0.8, density: 0, tags: 0.3, foodGroup: 0.8, diversity: 0.3 },
    adjustRange: [-300, 300],
  },
};

const SPLITS: Record<3 | 4 | 5, Partial<Record<MealType, number>>> = {
  3: { breakfast: 0.3, lunch: 0.4, dinner: 0.3 },
  4: { breakfast: 0.25, lunch: 0.3, snack: 0.15, dinner: 0.3 },
  5: { breakfast: 0.22, lunch: 0.28, snack: 0.12, dinner: 0.26, snack2: 0.12 },
};

export function defaultMealSplit(mealsPerDay: 3 | 4 | 5): Record<string, number> {
  return { ...SPLITS[mealsPerDay] } as Record<string, number>;
}

export const MEALS_FOR_COUNT: Record<3 | 4 | 5, MealType[]> = {
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "snack", "dinner"],
  5: ["breakfast", "lunch", "snack", "dinner", "snack2"],
};
