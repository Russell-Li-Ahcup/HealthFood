"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ModeCards } from "@/components/mode-switch";
import { DietExclusionEditor, ShoppingScheduleEditor, StorageSpaceEditor } from "@/components/settings-editors";
import { Button, Card, cn, Field, Input, NumberInput, Segmented } from "@/components/ui";
import { generatePlan } from "@/lib/actions";
import { todayKey } from "@/lib/dates";
import { fmt } from "@/lib/hooks";
import { defaultMealSplit, MODE_CONFIG } from "@/lib/nutrition/modes";
import { ACTIVITY_LEVELS, computeTargets } from "@/lib/nutrition/targets";
import type { Mode, Profile, Settings } from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";

const STEPS = ["选择模式", "基础信息", "活动水平", "饮食与采购"];

export default function OnboardingPage() {
  const router = useRouter();
  const p = useDataStore((s) => s.data.profile);
  const settings = useDataStore((s) => s.data.settings);
  const ingredients = useDataStore((s) => s.data.ingredients);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode | undefined>(p?.mode);
  const [gender, setGender] = useState<Profile["gender"]>(p?.gender ?? "male");
  const [birthDate, setBirthDate] = useState(p?.birthDate ?? "1998-01-01");
  const [heightCm, setHeight] = useState<number | undefined>(p?.heightCm);
  const [weightKg, setWeight] = useState<number | undefined>(p?.weightKg);
  const [targetWeightKg, setTargetWeight] = useState<number | undefined>(p?.targetWeightKg);
  const [gainPace, setGainPace] = useState<Profile["gainPace"]>(p?.gainPace ?? "steady");
  const [activityLevel, setActivity] = useState(p?.activityLevel ?? 2);
  const [dietTags, setDietTags] = useState<string[]>(settings.dietTags);
  const [shopping, setShopping] = useState<Settings["shopping"]>(settings.shopping);
  const [storageSpace, setStorageSpace] = useState<Settings["storageSpace"]>(settings.storageSpace);
  const [mealsPerDay, setMeals] = useState<3 | 4 | 5 | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const meals = mealsPerDay ?? (mode ? MODE_CONFIG[mode].defaultMealsPerDay : 3);
  const draft: Profile | null = useMemo(
    () =>
      mode && heightCm && weightKg
        ? {
            updatedAt: "",
            gender,
            birthDate,
            heightCm,
            weightKg,
            activityLevel,
            mode,
            gainPace,
            targetWeightKg: mode === "gain" ? targetWeightKg : undefined,
            baselineWeightKg: mode === "maintain" ? weightKg : undefined,
            calorieAdjustKcal: 0,
            modeChangedAt: todayKey(),
          }
        : null,
    [mode, gender, birthDate, heightCm, weightKg, activityLevel, gainPace, targetWeightKg],
  );
  const preview = draft ? computeTargets(draft, []) : null;

  const canNext = [Boolean(mode), Boolean(heightCm && weightKg && birthDate && (heightCm > 100 && heightCm < 230) && weightKg > 25), true, true][step];

  const finish = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const store = useDataStore.getState();
      await store.update((d, now) => ({
        ...d,
        profile: { ...draft, updatedAt: now },
        settings: { ...d.settings, dietTags, shopping, storageSpace, mealsPerDay: meals, mealSplit: defaultMealSplit(meals), onboarded: true, updatedAt: now },
      }));
      await store.upsert("weightLogs", { id: todayKey(), date: todayKey(), weightKg: draft.weightKg });
      await generatePlan();
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-mode={mode ?? "maintain"}>
      <div>
        <h1 className="text-2xl font-bold">欢迎使用 HealthFood</h1>
        <p className="mt-1 text-sm text-gray-500">花一分钟填写信息，我们会按营养目标随机排出到下次采购前的菜，再由这些菜决定买多少。</p>
      </div>
      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cn("h-1.5 rounded-full", i <= step ? "bg-brand-500" : "bg-gray-200")} />
            <div className={cn("mt-1 text-xs", i === step ? "font-medium text-brand-700" : "text-gray-400")}>{s}</div>
          </div>
        ))}
      </div>

      <Card>
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">选择你的目标，之后可以随时在顶部切换：</p>
            <ModeCards value={mode} onChange={setMode} />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="性别">
              <Segmented value={gender} onChange={setGender} options={[{ value: "male", label: "男" }, { value: "female", label: "女" }]} />
            </Field>
            <Field label="出生日期">
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
            <Field label="身高（cm）">
              <NumberInput value={heightCm} onChange={setHeight} placeholder="例如 172" />
            </Field>
            <Field label="当前体重（kg）">
              <NumberInput value={weightKg} onChange={setWeight} placeholder="例如 58.5" step="0.1" />
            </Field>
            {mode === "gain" && (
              <>
                <Field label="目标体重（kg）" hint="可选，用于显示增重进度和预计达成日期">
                  <NumberInput value={targetWeightKg} onChange={setTargetWeight} step="0.1" />
                </Field>
                <Field label="增重速度">
                  <Segmented
                    value={gainPace}
                    onChange={setGainPace}
                    options={[
                      { value: "steady", label: "稳健 +300 千卡" },
                      { value: "fast", label: "加速 +500 千卡" },
                    ]}
                  />
                </Field>
              </>
            )}
            {preview && (
              <div className="rounded-xl bg-gray-50 p-3 text-sm sm:col-span-2">
                BMI <b>{preview.bmi.bmi.toFixed(1)}</b>（{preview.bmi.label}），健康体重 {fmt(preview.bmi.healthyMinKg, 1)}–{fmt(preview.bmi.healthyMaxKg, 1)} kg
                {mode === "gain" && preview.bmi.level !== "under" && preview.bmi.level !== "normal" && (
                  <span className="mt-1 block text-amber-700">当前 BMI 偏高，增重模式可能不适合你，建议选择健康保持模式。</span>
                )}
                {mode === "maintain" && preview.bmi.level === "under" && <span className="mt-1 block text-amber-700">体重偏轻，可以考虑增重模式。</span>}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            {ACTIVITY_LEVELS.map((a) => (
              <button
                key={a.level}
                type="button"
                onClick={() => setActivity(a.level)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left ring-1 transition",
                  activityLevel === a.level ? "bg-brand-50 ring-brand-500" : "bg-white ring-gray-200 hover:bg-gray-50",
                )}
              >
                <div>
                  <div className="font-medium">{a.label}</div>
                  <div className="text-xs text-gray-500">{a.hint}</div>
                </div>
                <span className="text-xs text-gray-400">× {a.factor}</span>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 font-medium">每天吃几餐</h3>
              <Segmented
                value={meals}
                onChange={(v) => setMeals(v)}
                options={[
                  { value: 3, label: "3 餐" },
                  { value: 4, label: "4 餐（含加餐）" },
                  { value: 5, label: "5 餐" },
                ]}
              />
            </div>
            <div>
              <h3 className="mb-2 font-medium">采购安排</h3>
              <ShoppingScheduleEditor value={shopping} onChange={setShopping} />
            </div>
            <div>
              <h3 className="mb-2 font-medium">冰箱大概还能放多少</h3>
              <StorageSpaceEditor value={storageSpace} onChange={setStorageSpace} />
            </div>
            <div>
              <h3 className="mb-2 font-medium">忌口食材（可选）</h3>
              <DietExclusionEditor ingredients={ingredients} value={dietTags} onChange={setDietTags} />
            </div>
            {preview && (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-brand-50 p-4 text-sm sm:grid-cols-4">
                <Stat label="每日热量" value={`${fmt(preview.kcal)} 千卡`} />
                <Stat label="蛋白质" value={`${preview.proteinG} g`} />
                <Stat label="脂肪" value={`${preview.fatG} g`} />
                <Stat label="碳水" value={`${preview.carbG} g`} />
              </div>
            )}
            <p className="text-xs text-gray-400">
              数据默认只保存在本机。想在手机和电脑之间同步，完成后可在
              <Link href="/settings/sync" className="text-brand-600 hover:underline">
                设置 → 云同步
              </Link>
              中配置坚果云等 WebDAV 网盘。
            </p>
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ChevronLeft size={16} /> 上一步
        </Button>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
            下一步 <ChevronRight size={16} />
          </Button>
        ) : (
          <Button disabled={busy || !draft} onClick={finish}>
            {busy ? "正在生成方案…" : "生成我的饮食方案"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-brand-700">{value}</div>
    </div>
  );
}
