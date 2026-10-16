"use client";

import { TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { applyCalorieAdjust } from "@/lib/actions";
import { suggestAdjustment } from "@/lib/nutrition/weeklyAdjust";
import { useDataStore } from "@/lib/store/data-store";
import { Button } from "./ui";

/** 按体重趋势给出热量调整建议，必须由用户确认后才生效。 */
export function AdjustBanner() {
  const profile = useDataStore((s) => s.data.profile);
  const logs = useDataStore((s) => s.data.weightLogs);
  const suggestion = useMemo(() => (profile ? suggestAdjustment(profile, logs) : null), [profile, logs]);
  const [busy, setBusy] = useState(false);
  if (!suggestion) return null;
  const run = async (next: number | null) => {
    setBusy(true);
    await applyCalorieAdjust(next).finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
      <TrendingUp className="text-brand-600" size={20} />
      <p className="flex-1 text-sm text-brand-700">
        {suggestion.reason}。调整后每日热量修正为 {suggestion.next > 0 ? "+" : ""}
        {suggestion.next} 千卡，并按营养重排到下次采购前的菜。
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(null)}>
          暂不调整
        </Button>
        <Button size="sm" disabled={busy} onClick={() => run(suggestion.next)}>
          {suggestion.delta > 0 ? "多吃" : "少吃"} {Math.abs(suggestion.delta)} 千卡
        </Button>
      </div>
    </div>
  );
}
