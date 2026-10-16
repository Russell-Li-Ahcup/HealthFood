import type { Category, HealthData, Ingredient, PurchaseUnit, Recipe, StorageType } from "@/lib/schema/data";

// [key, 名称, 类别, kcal, 蛋白质, 脂肪, 碳水, 膳食纤维, 可食部, 采购单位, 单位重量g, 最小采购g, 单价, 存储, 保质天数, 冷冻保质天数(可冷冻)]
// 营养数据为每 100g 可食部，参考《中国食物成分表》，取整。按克购买的单价为 元/500g。
type Row = [string, string, Category, number, number, number, number, number, number, PurchaseUnit, number, number, number, StorageType, number, number?];

const INGREDIENTS: Row[] = [
  ["chicken_breast", "鸡胸肉", "meat", 133, 24.6, 1.9, 2.5, 0, 1, "g", 1, 250, 12, "fridge", 2, 90],
  ["chicken_leg", "鸡腿", "meat", 181, 16, 13, 0, 0, 0.7, "个", 200, 0, 5, "fridge", 2, 90],
  ["pork_loin", "猪里脊", "meat", 155, 20.2, 7.9, 0.7, 0, 1, "g", 1, 250, 18, "fridge", 2, 90],
  ["pork_belly", "猪五花肉", "meat", 349, 13.6, 30.6, 0, 0, 1, "g", 1, 250, 16, "fridge", 3, 90],
  ["pork_mince", "猪肉末", "meat", 263, 16, 21, 1, 0, 1, "g", 1, 200, 15, "fridge", 1, 60],
  ["beef_shank", "牛腱子", "meat", 122, 21, 3.5, 1, 0, 1, "g", 1, 250, 45, "fridge", 2, 120],
  ["beef_lean", "瘦牛肉", "meat", 106, 20.2, 2.3, 1.2, 0, 1, "g", 1, 250, 40, "fridge", 2, 120],
  ["lamb", "羊肉", "meat", 203, 19, 14, 0, 0, 1, "g", 1, 250, 45, "fridge", 2, 120],
  ["salmon", "三文鱼", "seafood", 139, 17.2, 7.8, 0, 0, 1, "g", 1, 200, 60, "fridge", 2, 60],
  ["shrimp", "虾仁（冷冻）", "seafood", 93, 18.6, 0.8, 2.8, 0, 1, "g", 1, 250, 35, "freezer", 90, 90],
  ["sea_bass", "鲈鱼", "seafood", 105, 18.6, 3.4, 0, 0, 0.58, "个", 600, 0, 30, "fridge", 1, 60],
  ["hairtail", "带鱼", "seafood", 127, 17.7, 4.9, 3.1, 0, 0.76, "g", 1, 500, 25, "fridge", 1, 90],
  ["egg", "鸡蛋", "egg", 144, 13.3, 8.8, 2.8, 0, 0.88, "个", 57, 0, 1, "fridge", 30],
  ["milk", "纯牛奶", "dairy", 65, 3.3, 3.6, 4.9, 0, 1, "盒", 250, 0, 3, "room", 90],
  ["yogurt", "无糖酸奶", "dairy", 72, 3.2, 3.3, 7.5, 0, 1, "盒", 100, 0, 4, "fridge", 14],
  ["milk_powder", "全脂奶粉", "dairy", 478, 20, 21.2, 51.7, 0, 1, "袋", 400, 0, 45, "room", 180],
  ["cheese", "奶酪片", "dairy", 328, 25.7, 23.5, 3.5, 0, 1, "盒", 200, 0, 30, "fridge", 30],
  ["broccoli", "西兰花", "vegetable", 36, 4.1, 0.6, 4.3, 1.6, 0.83, "个", 350, 0, 6, "fridge", 5],
  ["tomato", "番茄", "vegetable", 20, 0.9, 0.2, 4, 0.5, 0.97, "个", 150, 0, 1.5, "fridge", 7],
  ["cucumber", "黄瓜", "vegetable", 16, 0.8, 0.2, 2.9, 0.5, 0.92, "根", 250, 0, 2, "fridge", 5],
  ["carrot", "胡萝卜", "vegetable", 39, 1, 0.2, 8.8, 1.1, 0.96, "根", 150, 0, 1, "fridge", 14],
  ["onion", "洋葱", "vegetable", 40, 1.1, 0.2, 9, 0.9, 0.9, "个", 200, 0, 1.5, "room", 30],
  ["green_pepper", "青椒", "vegetable", 22, 1, 0.2, 5.4, 1.4, 0.82, "个", 100, 0, 1, "fridge", 7],
  ["eggplant", "茄子", "vegetable", 23, 1.1, 0.2, 4.9, 1.3, 0.93, "根", 300, 0, 3, "fridge", 5],
  ["zucchini", "西葫芦", "vegetable", 19, 0.8, 0.2, 3.8, 0.6, 0.73, "根", 400, 0, 3, "fridge", 7],
  ["mushroom", "香菇", "vegetable", 26, 2.2, 0.3, 5.2, 3.3, 1, "g", 1, 200, 10, "fridge", 4],
  ["bean_sprout", "绿豆芽", "vegetable", 18, 2.1, 0.1, 2.9, 1.5, 1, "袋", 300, 0, 2, "fridge", 2],
  ["pumpkin", "南瓜", "vegetable", 23, 0.7, 0.1, 5.3, 0.8, 0.85, "g", 1, 500, 3, "room", 30],
  ["spinach", "菠菜", "leafy", 28, 2.6, 0.3, 4.5, 1.7, 0.89, "把", 300, 0, 4, "fridge", 3],
  ["lettuce", "生菜", "leafy", 15, 1.4, 0.4, 2.1, 0.7, 0.94, "个", 400, 0, 4, "fridge", 4],
  ["bok_choy", "上海青", "leafy", 15, 1.5, 0.3, 2.7, 1.1, 0.87, "把", 400, 0, 4, "fridge", 3],
  ["napa_cabbage", "大白菜", "leafy", 18, 1.5, 0.1, 3.2, 0.8, 0.87, "个", 1500, 0, 6, "fridge", 14],
  ["celery", "芹菜", "leafy", 22, 1.2, 0.2, 4.5, 1.2, 0.67, "把", 400, 0, 3, "fridge", 7],
  ["banana", "香蕉", "fruit", 93, 1.4, 0.2, 22, 1.2, 0.59, "根", 180, 0, 1, "room", 4],
  ["apple", "苹果", "fruit", 53, 0.4, 0.2, 13.7, 1.7, 0.85, "个", 200, 0, 2.5, "fridge", 21],
  ["orange", "橙子", "fruit", 48, 0.8, 0.2, 11.1, 0.6, 0.74, "个", 220, 0, 2, "room", 14],
  ["blueberry", "蓝莓", "fruit", 57, 0.7, 0.3, 14.5, 2.4, 1, "盒", 125, 0, 12, "fridge", 5],
  ["rice", "大米", "grain", 347, 7.4, 0.8, 77.9, 0.7, 1, "袋", 5000, 0, 35, "room", 180],
  ["brown_rice", "糙米", "grain", 348, 7.7, 2.7, 76, 3.4, 1, "袋", 1000, 0, 15, "room", 180],
  ["oats", "燕麦片", "grain", 377, 15, 6.7, 66.9, 5.3, 1, "袋", 1000, 0, 20, "room", 180],
  ["wholewheat_bread", "全麦面包", "grain", 246, 8.5, 3.4, 46, 6, 1, "袋", 400, 0, 12, "room", 5, 30],
  ["noodles", "挂面", "grain", 353, 10.3, 0.6, 75.6, 0.7, 1, "袋", 1000, 0, 10, "room", 365],
  ["mantou", "馒头", "grain", 223, 7, 1.1, 47, 1.3, 1, "个", 100, 0, 1, "room", 2, 30],
  ["potato", "土豆", "grain", 77, 2, 0.2, 17.2, 0.7, 0.94, "个", 200, 0, 1.2, "room", 21],
  ["sweet_potato", "红薯", "grain", 102, 1.1, 0.2, 24.7, 1.6, 0.9, "个", 300, 0, 2, "room", 21],
  ["corn", "玉米", "grain", 112, 4, 1.2, 22.8, 2.9, 0.46, "根", 300, 0, 2.5, "fridge", 5, 90],
  ["tofu", "北豆腐", "bean", 116, 12.2, 4.8, 1.5, 0.5, 1, "盒", 400, 0, 4, "fridge", 3],
  ["edamame", "毛豆仁", "bean", 131, 13.1, 5, 10.5, 4, 1, "袋", 400, 0, 8, "fridge", 3, 90],
  ["mixed_nuts", "混合坚果", "nut", 607, 20, 52, 20, 8, 1, "袋", 500, 0, 40, "room", 120],
  ["peanut_butter", "花生酱", "nut", 600, 25, 50, 20, 6, 1, "瓶", 340, 0, 18, "room", 180],
  ["oil", "食用油", "oil", 899, 0, 99.9, 0, 0, 1, "瓶", 1800, 0, 60, "room", 365],
];

type RecipeRow = [string, string, Recipe["mealTypes"], string[], number, [string, number][]];
const LD: Recipe["mealTypes"] = ["lunch", "dinner"];

const RECIPES: RecipeRow[] = [
  ["oat_banana_bowl", "燕麦牛奶香蕉碗", ["breakfast"], ["增重友好", "高纤维"], 5, [["oats", 50], ["milk", 250], ["banana", 100]]],
  ["egg_sandwich", "鸡蛋全麦三明治", ["breakfast"], ["增重友好"], 10, [["wholewheat_bread", 80], ["egg", 100], ["lettuce", 30], ["tomato", 50], ["cheese", 20]]],
  ["sweet_potato_breakfast", "蒸红薯 + 鸡蛋 + 牛奶", ["breakfast"], ["清淡", "高纤维"], 15, [["sweet_potato", 200], ["egg", 50], ["milk", 250]]],
  ["spinach_egg_noodle", "菠菜鸡蛋面", ["breakfast", "lunch"], ["清淡"], 10, [["noodles", 80], ["egg", 50], ["spinach", 100], ["oil", 5]]],
  ["yogurt_oat_cup", "酸奶燕麦蓝莓杯", ["breakfast"], ["高纤维"], 3, [["yogurt", 200], ["oats", 40], ["blueberry", 60], ["mixed_nuts", 15]]],
  ["mantou_egg", "馒头 + 煮鸡蛋 + 拍黄瓜", ["breakfast"], ["清淡"], 10, [["mantou", 100], ["egg", 100], ["cucumber", 100]]],
  ["pb_banana_toast", "花生酱香蕉吐司 + 牛奶", ["breakfast"], ["增重友好"], 5, [["wholewheat_bread", 80], ["peanut_butter", 30], ["banana", 100], ["milk", 250]]],
  ["tomato_egg", "番茄炒蛋 + 米饭", LD, ["清淡"], 15, [["tomato", 200], ["egg", 100], ["rice", 100], ["oil", 10]]],
  ["chicken_broccoli", "西兰花炒鸡胸 + 糙米饭", LD, ["高纤维"], 20, [["chicken_breast", 150], ["broccoli", 200], ["brown_rice", 100], ["oil", 10]]],
  ["beef_potato_stew", "土豆炖牛腱 + 米饭", LD, ["增重友好"], 60, [["beef_shank", 150], ["potato", 200], ["carrot", 80], ["rice", 100], ["oil", 10]]],
  ["steamed_bass", "清蒸鲈鱼 + 炒上海青 + 米饭", LD, ["清淡"], 25, [["sea_bass", 150], ["bok_choy", 200], ["rice", 80], ["oil", 5]]],
  ["pepper_pork", "青椒肉丝 + 米饭", LD, [], 15, [["pork_loin", 120], ["green_pepper", 150], ["rice", 100], ["oil", 12]]],
  ["braised_pork", "红烧肉 + 醋溜白菜 + 米饭", LD, ["增重友好"], 60, [["pork_belly", 120], ["napa_cabbage", 200], ["rice", 120], ["oil", 8]]],
  ["salmon_zucchini", "香煎三文鱼 + 西葫芦 + 红薯", LD, ["增重友好", "高纤维"], 20, [["salmon", 150], ["zucchini", 200], ["sweet_potato", 200], ["oil", 8]]],
  ["shrimp_broccoli", "虾仁炒西兰花 + 米饭", LD, ["清淡"], 15, [["shrimp", 150], ["broccoli", 200], ["rice", 90], ["oil", 8]]],
  ["mapo_tofu", "麻婆豆腐 + 米饭", LD, [], 20, [["tofu", 250], ["pork_mince", 50], ["rice", 100], ["oil", 12]]],
  ["chicken_leg_potato", "鸡腿焖土豆 + 米饭", LD, ["增重友好"], 40, [["chicken_leg", 140], ["potato", 150], ["carrot", 50], ["rice", 120], ["oil", 10]]],
  ["tomato_beef", "番茄牛肉 + 蒜蓉菠菜 + 米饭", LD, [], 30, [["beef_lean", 120], ["tomato", 150], ["spinach", 150], ["rice", 100], ["oil", 12]]],
  ["eggplant_mince", "肉末茄子 + 米饭", LD, ["增重友好"], 20, [["eggplant", 250], ["pork_mince", 70], ["rice", 110], ["oil", 15]]],
  ["chicken_congee", "香菇鸡肉粥 + 炒青菜", LD, ["清淡"], 40, [["rice", 60], ["chicken_breast", 100], ["mushroom", 80], ["bok_choy", 200], ["oil", 6]]],
  ["onion_lamb", "洋葱炒羊肉 + 米饭", LD, ["增重友好"], 15, [["lamb", 130], ["onion", 150], ["rice", 110], ["oil", 12]]],
  ["fried_hairtail", "香煎带鱼 + 凉拌黄瓜 + 米饭", LD, [], 20, [["hairtail", 150], ["cucumber", 150], ["rice", 100], ["oil", 10]]],
  ["sprout_pork", "豆芽炒肉丝 + 米饭", LD, [], 15, [["bean_sprout", 200], ["pork_loin", 100], ["rice", 100], ["oil", 10]]],
  ["celery_beef", "芹菜炒牛肉 + 糙米饭", LD, ["高纤维"], 15, [["beef_lean", 120], ["celery", 200], ["brown_rice", 90], ["oil", 10]]],
  ["egg_fried_rice", "什锦蛋炒饭", LD, ["增重友好"], 15, [["rice", 120], ["egg", 100], ["carrot", 50], ["corn", 50], ["green_pepper", 50], ["oil", 12]]],
  ["pumpkin_chicken", "南瓜毛豆鸡丁 + 米饭", LD, ["高纤维"], 20, [["chicken_breast", 120], ["pumpkin", 150], ["edamame", 60], ["rice", 90], ["oil", 10]]],
  ["beef_noodle", "牛肉面", LD, ["增重友好"], 20, [["noodles", 120], ["beef_shank", 100], ["bok_choy", 150]]],
  ["chicken_salad", "鸡胸肉玉米沙拉", LD, ["清淡", "高纤维"], 15, [["chicken_breast", 150], ["lettuce", 150], ["tomato", 100], ["cucumber", 100], ["corn", 150], ["oil", 8]]],
  ["tofu_cabbage_soup", "豆腐白菜汤 + 馒头 + 鸡蛋", LD, ["清淡"], 20, [["tofu", 150], ["napa_cabbage", 200], ["mantou", 100], ["egg", 50]]],
  ["shrimp_zucchini", "西葫芦炒虾仁 + 蒸红薯", LD, ["清淡"], 15, [["shrimp", 120], ["zucchini", 250], ["sweet_potato", 200], ["oil", 8]]],
  ["snack_banana_milk", "香蕉 + 牛奶", ["snack"], ["增重友好"], 0, [["banana", 120], ["milk", 250]]],
  ["snack_nuts_yogurt", "坚果酸奶", ["snack"], ["增重友好"], 0, [["mixed_nuts", 30], ["yogurt", 150]]],
  ["snack_apple_nuts", "苹果 + 坚果", ["snack"], ["高纤维"], 0, [["apple", 200], ["mixed_nuts", 15]]],
  ["snack_milk_powder", "奶粉冲饮 + 全麦面包", ["snack"], ["增重友好"], 2, [["milk_powder", 40], ["wholewheat_bread", 60]]],
  ["snack_egg_orange", "煮鸡蛋 + 橙子", ["snack"], ["清淡"], 10, [["egg", 100], ["orange", 200]]],
  ["snack_blueberry_yogurt", "蓝莓酸奶", ["snack"], ["清淡"], 0, [["yogurt", 200], ["blueberry", 80]]],
  ["snack_pb_toast", "花生酱吐司", ["snack"], ["增重友好"], 3, [["wholewheat_bread", 60], ["peanut_butter", 25]]],
  ["snack_cheese_corn", "奶酪 + 煮玉米", ["snack"], [], 15, [["cheese", 20], ["corn", 150]]],
];

export const presetIngredientId = (key: string) => `p-${key}`;
export const presetRecipeId = (key: string) => `pr-${key}`;

export function presetIngredients(now: string): Ingredient[] {
  return INGREDIENTS.map(([key, name, category, kcal, proteinG, fatG, carbG, fiberG, edibleRatio, purchaseUnit, unitWeightG, minPurchaseG, pricePerUnit, storage, shelfLifeDays, frozen]) => ({
    id: presetIngredientId(key),
    updatedAt: now,
    name,
    category,
    per100g: { kcal, proteinG, fatG, carbG, fiberG },
    edibleRatio,
    purchaseUnit,
    unitWeightG,
    minPurchaseG,
    pricePerUnit,
    storage,
    shelfLifeDays,
    freezable: frozen !== undefined && storage !== "freezer",
    frozenShelfLifeDays: frozen,
    presetKey: key,
  }));
}

export function presetRecipes(now: string): Recipe[] {
  return RECIPES.map(([key, name, mealTypes, tags, cookMinutes, items]) => ({
    id: presetRecipeId(key),
    updatedAt: now,
    name,
    mealTypes,
    tags,
    cookMinutes,
    items: items.map(([ing, grams]) => ({ ingredientId: presetIngredientId(ing), grams })),
    presetKey: key,
    mine: false,
  }));
}

/** 只补充缺失的预置项，不覆盖用户改过的同名记录，也不恢复用户删除过的。 */
export function seedPresets(data: HealthData, now: string): HealthData {
  const haveIng = new Set(data.ingredients.map((i) => i.id));
  const haveRec = new Set(data.recipes.map((r) => r.id));
  return {
    ...data,
    ingredients: [
      ...data.ingredients,
      ...presetIngredients(now).filter((i) => !haveIng.has(i.id) && !data.tombstones.ingredients[i.id]),
    ],
    recipes: [...data.recipes, ...presetRecipes(now).filter((r) => !haveRec.has(r.id) && !data.tombstones.recipes[r.id])],
  };
}
