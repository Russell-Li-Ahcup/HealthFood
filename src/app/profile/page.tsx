"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AdjustBanner } from "@/components/adjust-banner";
import { ChartPlaceholder } from "@/components/charts";
import { BmiModeHint, ModeBadge } from "@/components/mode-switch";
import { Button, Card, cn, Field, Input, NumberInput, PageTitle, Segmented, Select } from "@/components/ui";
import { applyBody, logWeight } from "@/lib/actions";
import { formatDay, todayKey } from "@/lib/dates";
import { fmt } from "@/lib/hooks";
import { MODE_CONFIG } from "@/lib/nutrition/modes";
import { ACTIVITY_LEVELS, computeTargets, daysToTarget } from "@/lib/nutrition/targets";
import type { Profile } from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";

const WeightChart = dynamic(() => import("@/components/weight-chart"), {
  ssr: false,
  loading: () => <ChartPlaceholder height={220} />,
});

function sameBody(a: Profile, b: Profile) {
  const keys = ["gender", "birthDate", "heightCm", "weightKg", "activityLevel", "gainPace", "targetWeightKg", "baselineWeightKg", "calorieAdjustKcal"] as const;
  return keys.every((k) => a[k] === b[k]) && JSON.stringify(a.targetOverride ?? {}) === JSON.stringify(b.targetOverride ?? {});
}

export default function ProfilePage() {
  const profile = useDataStore((s) => s.data.profile);
  const logs = useDataStore((s) => s.data.weightLogs);
  const [draft, setDraft] = useState(profile);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!profile) return;
    setDraft((d) => {
      if (!d) return profile;
      if (profile.mode !== d.mode) return { ...d, mode: profile.mode };
      if (profile.weightKg !== d.weightKg && profile.updatedAt > d.updatedAt) return { ...d, weightKg: profile.weightKg, updatedAt: profile.updatedAt };
      return d;
    });
  }, [profile]);
  useEffect(() => {
    if (!profile || !draft || sameBody(draft, profile)) return;
    if (draft.heightCm < 120 || draft.heightCm > 230 || draft.weightKg < 30 || draft.weightKg > 250) return;
    const timer = setTimeout(() => {
      const override = draft.targetOverride;
      const clean = override && Object.fromEntries(Object.entries(override).filter(([, v]) => v !== undefined));
      void applyBody({
        gender: draft.gender,
        birthDate: draft.birthDate,
        heightCm: draft.heightCm,
        weightKg: draft.weightKg,
        activityLevel: draft.activityLevel,
        gainPace: draft.gainPace,
        targetWeightKg: draft.targetWeightKg,
        baselineWeightKg: draft.baselineWeightKg,
        calorieAdjustKcal: draft.calorieAdjustKcal,
        targetOverride: clean && Object.keys(clean).length ? clean : undefined,
      }).then(() => {
        setStatus("目标已更新，今天之后没锁定的餐已按新目标调整份量");
        setTimeout(() => setStatus(""), 2500);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, profile]);
  const targets = useMemo(() => (draft ? computeTargets(draft, logs) : null), [draft, logs]);
  if (!profile || !draft || !targets) return null;
  const cfg = MODE_CONFIG[draft.mode];

  return (
    <div className="space-y-4">
      <PageTitle title="身体档案" subtitle="身高、体重、活动量可以随时改，每日目标马上跟着变" action={<ModeBadge />} />
      {status && <p className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{status}</p>}
      <AdjustBanner />
      <BmiModeHint />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="BMI" className="lg:col-span-1">
          <BmiScale bmi={targets.bmi.bmi} />
          <p className="mt-3 text-sm text-gray-600">
            当前 <b className="text-lg">{targets.bmi.bmi.toFixed(1)}</b>（{targets.bmi.label}），身高 {draft.heightCm} cm 的健康体重为{" "}
            {fmt(targets.bmi.healthyMinKg, 1)}–{fmt(targets.bmi.healthyMaxKg, 1)} kg。
          </p>
        </Card>
        <Card title="每日营养目标" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="基础代谢 BMR" value={`${fmt(targets.bmr)}`} unit="千卡" />
            <Metric label="日常消耗 TDEE" value={`${fmt(targets.tdee)}`} unit="千卡" />
            <Metric label="目标热量" value={`${fmt(targets.kcal)}`} unit="千卡" highlight />
            <Metric label="蛋白质" value={`${targets.proteinG}`} unit="g" />
            <Metric label="脂肪" value={`${targets.fatG}`} unit="g" />
            <Metric label="碳水化合物" value={`${targets.carbG}`} unit="g" />
            <Metric label="膳食纤维" value={`${targets.fiberG}`} unit="g" />
            <Metric label="饮水" value={`${fmt(targets.waterMl)}`} unit="ml" />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            按你现在填的数字实时计算。{cfg.label}：TDEE {draft.mode === "gain" ? `+ ${cfg.surplusKcal[draft.gainPace]} 千卡盈余` : "持平"}
            {draft.calorieAdjustKcal ? `，热量修正 ${draft.calorieAdjustKcal > 0 ? "+" : ""}${draft.calorieAdjustKcal} 千卡` : ""}
            ；蛋白质 {cfg.proteinPerKg} g/kg，脂肪占热量 {Math.round(cfg.fatRatio * 100)}%，其余为碳水。
            {draft.targetOverride && Object.values(draft.targetOverride).some((v) => v !== undefined) && " 有数字被你手动固定，清掉后会回到公式。"}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileForm draft={draft} onChange={setDraft} />
        <WeightCard />
      </div>
      <OverrideCard draft={draft} onChange={setDraft} />
      <Card title="体重趋势">
        <WeightChart logs={logs} baseline={draft.mode === "maintain" ? draft.baselineWeightKg : undefined} target={draft.mode === "gain" ? draft.targetWeightKg : undefined} />
        {draft.mode === "maintain" && draft.baselineWeightKg && <p className="text-xs text-gray-500">色带为保持区间：基准 {draft.baselineWeightKg} kg ± 1 kg。</p>}
        {draft.mode === "gain" && draft.targetWeightKg && (
          <GainEta current={targets.weightKg} target={draft.targetWeightKg} surplus={targets.kcal - targets.tdee} />
        )}
      </Card>
    </div>
  );
}

function GainEta({ current, target, surplus }: { current: number; target: number; surplus: number }) {
  const days = daysToTarget(current, target, surplus);
  if (current >= target) return <p className="mt-1 text-sm text-brand-700">已达到目标体重！可以考虑切换到健康保持模式。</p>;
  if (!days) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return (
    <p className="mt-1 text-xs text-gray-500">
      按每日 {fmt(surplus)} 千卡盈余估算（7700 千卡 ≈ 1 kg），还需约 {days} 天，预计 {date.getFullYear()}年{date.getMonth() + 1}月{date.getDate()}日 达到 {target} kg。
    </p>
  );
}

function Metric({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl p-3", highlight ? "bg-brand-50" : "bg-gray-50")}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={cn("text-xl font-bold", highlight ? "text-brand-700" : "text-gray-800")}>
        {value} <span className="text-xs font-normal text-gray-400">{unit}</span>
      </div>
    </div>
  );
}

function BmiScale({ bmi }: { bmi: number }) {
  const lo = 15;
  const hi = 32;
  const pos = Math.min(100, Math.max(0, ((bmi - lo) / (hi - lo)) * 100));
  const seg = (a: number, b: number) => `${((b - a) / (hi - lo)) * 100}%`;
  return (
    <div>
      <div className="relative mt-6 flex h-3 overflow-hidden rounded-full">
        <div className="bg-sky-300" style={{ width: seg(lo, 18.5) }} />
        <div className="bg-emerald-400" style={{ width: seg(18.5, 24) }} />
        <div className="bg-amber-400" style={{ width: seg(24, 28) }} />
        <div className="bg-red-400" style={{ width: seg(28, hi) }} />
      </div>
      <div className="relative h-0">
        <div className="absolute -top-7 -translate-x-1/2 rounded-md bg-gray-800 px-1.5 py-0.5 text-[11px] text-white" style={{ left: `${pos}%` }}>
          {bmi.toFixed(1)}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>偏瘦</span>
        <span>18.5</span>
        <span>正常</span>
        <span>24</span>
        <span>超重</span>
        <span>28</span>
        <span>肥胖</span>
      </div>
    </div>
  );
}

function ProfileForm({ draft, onChange }: { draft: Profile; onChange: (p: Profile) => void }) {
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...draft, [k]: v });
  const f = draft;
  return (
    <Card title="基础信息" action={<span className="text-xs text-gray-400">改完自动保存</span>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="性别">
          <Segmented value={f.gender} onChange={(v) => set("gender", v)} options={[{ value: "male", label: "男" }, { value: "female", label: "女" }]} />
        </Field>
        <Field label="出生日期">
          <Input type="date" value={f.birthDate} onChange={(e) => set("birthDate", e.target.value)} />
        </Field>
        <Field label="身高（cm）">
          <NumberInput value={f.heightCm} onChange={(v) => set("heightCm", v ?? f.heightCm)} />
        </Field>
        <Field label="当前体重（kg）" hint="改这里会立刻重算目标，并记一笔今天的体重">
          <NumberInput value={f.weightKg} onChange={(v) => set("weightKg", v ?? f.weightKg)} step="0.1" />
        </Field>
        <Field label="活动水平" className="col-span-2">
          <Select value={f.activityLevel} onChange={(e) => set("activityLevel", Number(e.target.value))}>
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a.level} value={a.level}>
                {a.label}（{a.hint}）
              </option>
            ))}
          </Select>
        </Field>
        {f.mode === "gain" ? (
          <>
            <Field label="目标体重（kg）">
              <NumberInput value={f.targetWeightKg} onChange={(v) => set("targetWeightKg", v)} step="0.1" />
            </Field>
            <Field label="增重速度">
              <Select value={f.gainPace} onChange={(e) => set("gainPace", e.target.value as Profile["gainPace"])}>
                <option value="steady">稳健（+300 千卡）</option>
                <option value="fast">加速（+500 千卡）</option>
              </Select>
            </Field>
          </>
        ) : (
          <Field label="保持基准体重（kg）" hint="体重偏离此值 1 kg 以上时会建议微调热量">
            <NumberInput value={f.baselineWeightKg} onChange={(v) => set("baselineWeightKg", v)} step="0.1" />
          </Field>
        )}
      </div>
    </Card>
  );
}

function WeightCard() {
  const logs = useDataStore((s) => s.data.weightLogs);
  const [date, setDate] = useState(todayKey());
  const [weight, setWeight] = useState<number | undefined>();
  const recent = [...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return (
    <Card title="记录体重">
      <div className="flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-40" />
        <NumberInput value={weight} onChange={setWeight} placeholder="体重 kg" step="0.1" />
        <Button
          disabled={!weight}
          onClick={async () => {
            await logWeight(date, weight!);
            setWeight(undefined);
          }}
        >
          记录
        </Button>
      </div>
      <p className="mt-2 text-xs text-gray-400">建议每周固定 2–3 次在早晨空腹称重。同一天重复记录会覆盖。</p>
      <ul className="mt-3 divide-y divide-gray-50 text-sm">
        {recent.map((l) => (
          <li key={l.id} className="flex justify-between py-1.5">
            <span className="text-gray-500">{formatDay(l.date)}</span>
            <span className="flex items-center gap-3">
              <b>{l.weightKg} kg</b>
              <button className="text-xs text-gray-400 hover:text-red-500" onClick={() => void useDataStore.getState().remove("weightLogs", l.id)}>
                删除
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OverrideCard({ draft, onChange }: { draft: Profile; onChange: (p: Profile) => void }) {
  const o = draft.targetOverride ?? {};
  const setO = (next: Profile["targetOverride"]) => onChange({ ...draft, targetOverride: next });
  return (
    <Card title="手动固定目标（可选）" action={<span className="text-xs text-gray-400">留空就按上面的公式算</span>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label="热量修正（千卡）" hint="在公式结果上加减">
          <NumberInput value={draft.calorieAdjustKcal} onChange={(v) => onChange({ ...draft, calorieAdjustKcal: v ?? 0 })} />
        </Field>
        <Field label="固定热量" hint="留空 = 自动计算">
          <NumberInput value={o.kcal} onChange={(v) => setO({ ...o, kcal: v })} />
        </Field>
        <Field label="固定蛋白质 g">
          <NumberInput value={o.proteinG} onChange={(v) => setO({ ...o, proteinG: v })} />
        </Field>
        <Field label="固定脂肪 g">
          <NumberInput value={o.fatG} onChange={(v) => setO({ ...o, fatG: v })} />
        </Field>
        <Field label="固定碳水 g">
          <NumberInput value={o.carbG} onChange={(v) => setO({ ...o, carbG: v })} />
        </Field>
      </div>
    </Card>
  );
}
