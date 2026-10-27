import { z } from "zod";

export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "snack2"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  snack: "加餐",
  dinner: "晚餐",
  snack2: "晚加餐",
};

export const CATEGORIES = [
  "meat", "seafood", "egg", "dairy", "vegetable", "leafy", "fruit", "grain", "bean", "nut", "oil", "condiment", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  meat: "肉禽", seafood: "水产", egg: "蛋类", dairy: "奶类", vegetable: "蔬菜", leafy: "叶菜",
  fruit: "水果", grain: "主食谷薯", bean: "大豆制品", nut: "坚果", oil: "油脂", condiment: "调味", other: "其他",
};

export const PURCHASE_UNITS = ["g", "个", "盒", "把", "袋", "瓶", "根", "包"] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];

export const STORAGE_TYPES = ["room", "fridge", "freezer"] as const;
export type StorageType = (typeof STORAGE_TYPES)[number];
export const STORAGE_LABEL: Record<StorageType, string> = { room: "常温", fridge: "冷藏", freezer: "冷冻" };

/** 采购时对照的储物位置。用户只需要大概估还能放几份。 */
export const FRIDGE_SLOTS = ["fridge", "crisper", "door", "freezer", "room"] as const;
export type FridgeSlot = (typeof FRIDGE_SLOTS)[number];
export const FRIDGE_SLOT_LABEL: Record<FridgeSlot, string> = {
  fridge: "冷藏层",
  crisper: "蔬菜盒",
  door: "冰箱门",
  freezer: "冷冻层",
  room: "常温柜",
};
export const FRIDGE_SLOT_HINT: Record<FridgeSlot, string> = {
  fridge: "肉、奶、熟食",
  crisper: "叶菜、瓜果",
  door: "鸡蛋、调味、饮料",
  freezer: "冻肉、速冻食品",
  room: "米面、罐头、坚果",
};
/** 1 份 ≈ 一盒 / 一小袋单独占的位置。默认按「瞄一眼」的空位。 */
export const DEFAULT_STORAGE_SPACE: Record<FridgeSlot, number> = {
  fridge: 4,
  crisper: 4,
  door: 4,
  freezer: 6,
  room: 10,
};

const iso = z.string();

export const NutrientsSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  fatG: z.number(),
  carbG: z.number(),
  fiberG: z.number().default(0),
});
export type Nutrients = z.infer<typeof NutrientsSchema>;

export const IngredientSchema = z.object({
  id: z.string(),
  updatedAt: iso,
  name: z.string(),
  category: z.enum(CATEGORIES),
  per100g: NutrientsSchema,
  edibleRatio: z.number().min(0.1).max(1).default(1),
  purchaseUnit: z.enum(PURCHASE_UNITS).default("g"),
  unitWeightG: z.number().positive().default(1),
  minPurchaseG: z.number().min(0).default(0),
  pricePerUnit: z.number().optional(),
  storage: z.enum(STORAGE_TYPES).default("fridge"),
  shelfLifeDays: z.number().int().min(1),
  freezable: z.boolean().default(false),
  frozenShelfLifeDays: z.number().int().optional(),
  presetKey: z.string().optional(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const RecipeItemSchema = z.object({
  ingredientId: z.string(),
  grams: z.number().positive(),
  /** 对应买过的完整商品；有的话扣库存、显示名称都按商品。 */
  productId: z.string().optional(),
});
export type RecipeItem = z.infer<typeof RecipeItemSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  updatedAt: iso,
  name: z.string(),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner", "snack"])),
  tags: z.array(z.string()).default([]),
  cookMinutes: z.number().default(15),
  items: z.array(RecipeItemSchema),
  presetKey: z.string().optional(),
  /** 用户自己的菜单。预置菜单只作随机抽选池，不会写进「我的菜单」。缺省时：有 presetKey 的不算用户菜单。 */
  mine: z.boolean().optional(),
  /** 制作视频或文档链接。 */
  guideUrl: z.string().optional(),
  /** 做法文字记录。 */
  guideNotes: z.string().optional(),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export function isUserRecipe(recipe: Recipe): boolean {
  if (recipe.mine === true) return true;
  if (recipe.mine === false) return false;
  return !recipe.presetKey;
}

export const MealEntrySchema = z.object({
  id: z.string(), // `${date}_${mealType}`
  updatedAt: iso,
  date: z.string(),
  mealType: z.enum(MEAL_TYPES),
  kind: z.enum(["home", "eat_out", "skip"]),
  recipeId: z.string().optional(),
  scale: z.number().default(1),
  locked: z.boolean().default(false),
  eaten: z.boolean().default(false),
  eatOutLevel: z.enum(["light", "normal", "heavy", "custom"]).optional(),
  eatOutKcal: z.number().optional(),
  items: z.array(RecipeItemSchema).default([]),
  /** 自己配的这餐的名称，例如「牛奶 250ml + 鸡胸 150g」。 */
  customName: z.string().optional(),
});
export type MealEntry = z.infer<typeof MealEntrySchema>;

/** 计划里用户主动安排的餐：自己的菜谱或自己配的一餐（不含系统随机填的推荐菜）。 */
export function isUserPlannedMeal(entry: MealEntry, recipe?: Recipe | null): boolean {
  if (entry.kind !== "home" || entry.items.length === 0) return false;
  if (entry.customName) return true;
  if (recipe && isUserRecipe(recipe)) return true;
  return false;
}

export const ProductSchema = z.object({
  id: z.string(),
  updatedAt: iso,
  /** 超市里看到的完整名称，例如「Lidl Spare Ribs」。 */
  name: z.string(),
  /** 包装照片（压到约 18KB 的 JPEG data URL）。 */
  image: z.string().optional(),
  /** 可选：对应食材库，方便入库和对照饮食方案。 */
  ingredientId: z.string().optional(),
  /** 一整包的重量，不能拆开买。 */
  packG: z.number().positive().optional(),
  price: z.number().optional(),
  store: z.string().optional(),
  /** 好吃就勾上，下次采购自动还用这件。 */
  repeat: z.boolean().default(false),
  /** 最近一次实际买到的日期，用来在档案里翻出来。 */
  lastBoughtAt: z.string().optional(),
  boughtCount: z.number().int().min(0).default(0),
});
export type Product = z.infer<typeof ProductSchema>;

export const ShoppingItemSchema = z.object({
  ingredientId: z.string().optional(),
  productId: z.string().optional(),
  /** 用户手动加进清单的，重新计算时保留。 */
  manual: z.boolean().optional(),
  /** 用户改过包数后不再被自动覆盖。 */
  qtyLocked: z.boolean().optional(),
  packG: z.number().optional(),
  needG: z.number(),
  buyQty: z.number(),
  buyUnit: z.enum(PURCHASE_UNITS),
  buyG: z.number(),
  estPrice: z.number().optional(),
  checked: z.boolean().default(false),
  freeze: z.boolean().default(false),
  warning: z.string().optional(),
});
export type ShoppingItem = z.infer<typeof ShoppingItemSchema>;

export const ShoppingTripSchema = z.object({
  id: z.string(),
  updatedAt: iso,
  date: z.string(),
  coversFrom: z.string(),
  coversTo: z.string(),
  status: z.enum(["planned", "done"]),
  items: z.array(ShoppingItemSchema),
});
export type ShoppingTrip = z.infer<typeof ShoppingTripSchema>;

export const InventoryItemSchema = z.object({
  id: z.string(),
  updatedAt: iso,
  /** 和采购清单同一件商品。旧数据可能只有食材。 */
  productId: z.string().optional(),
  ingredientId: z.string().optional(),
  quantityG: z.number(),
  packG: z.number().positive().optional(),
  purchasedAt: z.string(),
  expiresAt: z.string(),
  storage: z.enum(STORAGE_TYPES),
  sourceTripId: z.string().optional(),
  status: z.enum(["active", "used", "discarded"]),
  discardedG: z.number().optional(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const WeightLogSchema = z.object({
  id: z.string(), // = date
  updatedAt: iso,
  date: z.string(),
  weightKg: z.number(),
});
export type WeightLog = z.infer<typeof WeightLogSchema>;

export const ModeSchema = z.enum(["gain", "maintain"]);
export type Mode = z.infer<typeof ModeSchema>;

export const ProfileSchema = z.object({
  updatedAt: iso,
  gender: z.enum(["male", "female"]),
  birthDate: z.string(),
  heightCm: z.number(),
  weightKg: z.number(),
  activityLevel: z.number().int().min(1).max(5),
  mode: ModeSchema,
  gainPace: z.enum(["steady", "fast"]).default("steady"),
  targetWeightKg: z.number().optional(),
  baselineWeightKg: z.number().optional(),
  calorieAdjustKcal: z.number().default(0),
  lastAdjustCheck: z.string().optional(),
  modeChangedAt: z.string().optional(),
  targetOverride: z
    .object({ kcal: z.number().optional(), proteinG: z.number().optional(), fatG: z.number().optional(), carbG: z.number().optional() })
    .optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const SettingsSchema = z.object({
  updatedAt: iso,
  mealsPerDay: z.union([z.literal(3), z.literal(4), z.literal(5)]).default(3),
  mealSplit: z.record(z.string(), z.number()).default({ breakfast: 0.3, lunch: 0.4, dinner: 0.3 }),
  mealSplitCustomized: z.boolean().default(false),
  dietTags: z.array(z.string()).default([]),
  shopping: z
    .object({
      mode: z.enum(["fixed", "random", "manual"]).default("fixed"),
      fixedWeekdays: z.array(z.number().int().min(1).max(7)).default([6]),
      randomTimesPerWeek: z.union([z.literal(1), z.literal(2)]).default(1),
      seed: z.number().default(1),
      manualDates: z.array(z.string()).default([]),
    })
    .default({ mode: "fixed", fixedWeekdays: [6], randomTimesPerWeek: 1, seed: 1, manualDates: [] }),
  /** 各储物位置大概还能放几份，由用户目测，不求精确。 */
  storageSpace: z
    .object({
      fridge: z.number().int().min(0).max(20).default(DEFAULT_STORAGE_SPACE.fridge),
      crisper: z.number().int().min(0).max(20).default(DEFAULT_STORAGE_SPACE.crisper),
      door: z.number().int().min(0).max(20).default(DEFAULT_STORAGE_SPACE.door),
      freezer: z.number().int().min(0).max(20).default(DEFAULT_STORAGE_SPACE.freezer),
      room: z.number().int().min(0).max(20).default(DEFAULT_STORAGE_SPACE.room),
    })
    .default(DEFAULT_STORAGE_SPACE),
  weekSeeds: z.record(z.string(), z.number()).default({}),
  onboarded: z.boolean().default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const COLLECTIONS = ["ingredients", "recipes", "products", "mealEntries", "shoppingTrips", "inventory", "weightLogs"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

const TombstoneMap = z.record(z.string(), z.string());
export const TombstonesSchema = z.object({
  ingredients: TombstoneMap.default({}),
  recipes: TombstoneMap.default({}),
  products: TombstoneMap.default({}),
  mealEntries: TombstoneMap.default({}),
  shoppingTrips: TombstoneMap.default({}),
  inventory: TombstoneMap.default({}),
  weightLogs: TombstoneMap.default({}),
});
export type Tombstones = z.infer<typeof TombstonesSchema>;

export const HealthDataSchema = z.object({
  version: z.literal(1),
  meta: z.object({ updatedAt: iso, etag: z.string().optional() }),
  profile: ProfileSchema.nullable(),
  settings: SettingsSchema,
  ingredients: z.array(IngredientSchema),
  recipes: z.array(RecipeSchema),
  products: z.array(ProductSchema).default([]),
  mealEntries: z.array(MealEntrySchema),
  shoppingTrips: z.array(ShoppingTripSchema),
  inventory: z.array(InventoryItemSchema),
  weightLogs: z.array(WeightLogSchema),
  tombstones: TombstonesSchema,
});
export type HealthData = z.infer<typeof HealthDataSchema>;

export function emptyTombstones(): Tombstones {
  return { ingredients: {}, recipes: {}, products: {}, mealEntries: {}, shoppingTrips: {}, inventory: {}, weightLogs: {} };
}

export function defaultSettings(now = new Date().toISOString()): Settings {
  return SettingsSchema.parse({ updatedAt: now });
}

/** Defaults and presets carry this timestamp so any real edit from another device wins the merge. */
export const EPOCH = "1970-01-01T00:00:00.000Z";

export function createEmptyData(): HealthData {
  const now = new Date().toISOString();
  return {
    version: 1,
    meta: { updatedAt: now },
    profile: null,
    settings: defaultSettings(EPOCH),
    ingredients: [],
    recipes: [],
    products: [],
    mealEntries: [],
    shoppingTrips: [],
    inventory: [],
    weightLogs: [],
    tombstones: emptyTombstones(),
  };
}

export function touchData(data: HealthData): HealthData {
  return { ...data, meta: { ...data.meta, updatedAt: new Date().toISOString() } };
}

export function parseData(raw: unknown): HealthData {
  return HealthDataSchema.parse(migrateData(raw));
}

/** 版本升级入口：目前只有 v1。 */
export function migrateData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") throw new Error("数据格式无效");
  const data = raw as { version?: number };
  if (data.version === 1) return data;
  throw new Error(`不支持的数据版本：${String(data.version)}`);
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function mealEntryId(date: string, mealType: MealType): string {
  return `${date}_${mealType}`;
}
