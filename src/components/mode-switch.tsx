"use client";

import { Dumbbell, Leaf } from "lucide-react";
import { useState } from "react";
import { switchMode } from "@/lib/actions";
import { useTargets } from "@/lib/hooks";
import { MODE_CONFIG } from "@/lib/nutrition/modes";
import type { Mode } from "@/lib/schema/data";
import { useDataStore } from "@/lib/store/data-store";
import { Button, cn, Modal } from "./ui";

export const MODE_ICON = { gain: Dumbbell, maintain: Leaf };

export function ModeCards({ value, onChange }: { value: Mode | undefined; onChange: (m: Mode) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["gain", "maintain"] as Mode[]).map((m) => {
        const cfg = MODE_CONFIG[m];
        const Icon = MODE_ICON[m];
        const active = value === m;
        const color = m === "gain" ? "orange" : "emerald";
        return (
          <button
            key={m}
            type="button"
            data-mode={m}
            onClick={() => onChange(m)}
            className={cn(
              "rounded-2xl p-4 text-left ring-2 transition",
              active ? "bg-brand-50 ring-brand-500" : "bg-white ring-gray-100 hover:ring-gray-200",
            )}
          >
            <div className={cn("mb-2 inline-flex rounded-xl p-2", color === "orange" ? "bg-orange-100 text-orange-600" : "bg-emerald-100 text-emerald-600")}>
              <Icon size={22} />
            </div>
            <div className="text-lg font-semibold">{cfg.label}</div>
            <div className="mt-1 text-xs font-medium text-gray-500">适合：{cfg.suitable}</div>
            <p className="mt-2 text-sm text-gray-600">{cfg.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function ModeBadge() {
  const profile = useDataStore((s) => s.data.profile);
  const customized = useDataStore((s) => s.data.settings.mealSplitCustomized);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const Icon = MODE_ICON[profile.mode];
  const next = target ?? (profile.mode === "gain" ? "maintain" : "gain");

  const confirm = async (resetMeals: boolean) => {
    setBusy(true);
    try {
      await switchMode(next, resetMeals);
      setOpen(false);
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
      >
        <Icon size={15} />
        {MODE_CONFIG[profile.mode].label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="切换模式">
        <ModeCards value={next} onChange={setTarget} />
        {next !== profile.mode && (
          <div className="mt-4 space-y-3 text-sm text-gray-600">
            <p>
              切换后将清零自动热量调整，餐次改为{MODE_CONFIG[next].defaultMealsPerDay} 餐，并按营养重排当前采购周期里今天起未锁定的餐，采购量跟着这些菜走。
              {next === "maintain" && "当前体重会记为保持基准。"}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {customized && (
                <Button variant="secondary" disabled={busy} onClick={() => confirm(false)}>
                  切换但保留我的餐次设置
                </Button>
              )}
              <Button disabled={busy} onClick={() => confirm(true)}>
                切换到{MODE_CONFIG[next].label}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function BmiModeHint() {
  const profile = useDataStore((s) => s.data.profile);
  const targets = useTargets();
  if (!profile || !targets) return null;
  const { level } = targets.bmi;
  let text = "";
  if (profile.mode === "gain" && (level === "over" || level === "obese")) text = `当前 BMI ${targets.bmi.bmi.toFixed(1)} 已偏高，建议使用健康保持模式。`;
  if (profile.mode === "maintain" && level === "under") text = `当前 BMI ${targets.bmi.bmi.toFixed(1)}，体重偏轻，可以试试增重模式。`;
  if (!text) return null;
  return <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{text}</div>;
}
