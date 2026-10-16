"use client";

import { Cloud, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { DietExclusionEditor, ShoppingScheduleEditor, StorageSpaceEditor } from "@/components/settings-editors";
import { Button, Card, PageTitle, Segmented } from "@/components/ui";
import { replanCurrentWeek } from "@/lib/actions";
import { defaultMealSplit, MEALS_FOR_COUNT, MODE_CONFIG } from "@/lib/nutrition/modes";
import { MEAL_LABEL, type Settings } from "@/lib/schema/data";
import { downloadBackup, importBackup } from "@/lib/storage/backup";
import { useDataStore } from "@/lib/store/data-store";

export default function SettingsPage() {
  const data = useDataStore((s) => s.data);
  const [s, setS] = useState<Settings>(data.settings);
  const [saved, setSaved] = useState(false);
  const [importError, setImportError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const meals = MEALS_FOR_COUNT[s.mealsPerDay];
  const splitTotal = meals.reduce((sum, m) => sum + (s.mealSplit[m] ?? 0), 0);
  const mode = data.profile?.mode ?? "maintain";

  const save = async () => {
    await useDataStore.getState().setSettings({
      mealsPerDay: s.mealsPerDay,
      mealSplit: Object.fromEntries(meals.map((m) => [m, (s.mealSplit[m] ?? 0) / (splitTotal || 1)])),
      mealSplitCustomized: s.mealSplitCustomized,
      dietTags: s.dietTags,
      shopping: s.shopping,
      storageSpace: s.storageSpace,
    });
    await replanCurrentWeek();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="设置"
        subtitle="修改后点击保存，会按营养重排当前采购周期里今天起未锁定的餐，并按这些菜更新采购量"
        action={<Button onClick={save}>{saved ? "已保存" : "保存并重排这段菜单"}</Button>}
      />

      <Card title="餐次与热量分配">
        <Segmented
          value={s.mealsPerDay}
          onChange={(n) => setS({ ...s, mealsPerDay: n, mealSplit: defaultMealSplit(n), mealSplitCustomized: n !== MODE_CONFIG[mode].defaultMealsPerDay })}
          options={[
            { value: 3, label: "3 餐" },
            { value: 4, label: "4 餐" },
            { value: 5, label: "5 餐" },
          ]}
        />
        <div className="mt-4 space-y-3">
          {meals.map((m) => {
            const pct = Math.round(((s.mealSplit[m] ?? 0) / (splitTotal || 1)) * 100);
            return (
              <div key={m} className="flex items-center gap-3">
                <span className="w-14 text-sm">{MEAL_LABEL[m]}</span>
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={Math.round((s.mealSplit[m] ?? 0) * 100)}
                  onChange={(e) => setS({ ...s, mealSplit: { ...s.mealSplit, [m]: Number(e.target.value) / 100 }, mealSplitCustomized: true })}
                  className="flex-1 accent-[var(--brand-600)]"
                />
                <span className="w-12 text-right text-sm text-gray-600">{pct}%</span>
              </div>
            );
          })}
          <p className="text-xs text-gray-400">保存时会自动归一化为 100%。{MODE_CONFIG[mode].label}默认 {MODE_CONFIG[mode].defaultMealsPerDay} 餐。</p>
          <button className="text-xs text-brand-600 hover:underline" onClick={() => setS({ ...s, mealSplit: defaultMealSplit(s.mealsPerDay), mealSplitCustomized: false })}>
            恢复默认比例
          </button>
        </div>
      </Card>

      <Card title="采购安排">
        <ShoppingScheduleEditor value={s.shopping} onChange={(shopping) => setS({ ...s, shopping })} />
      </Card>

      <Card title="冰箱空位">
        <StorageSpaceEditor value={s.storageSpace} onChange={(storageSpace) => setS({ ...s, storageSpace })} />
      </Card>

      <Card title="忌口食材">
        <DietExclusionEditor ingredients={data.ingredients} value={s.dietTags} onChange={(dietTags) => setS({ ...s, dietTags })} />
      </Card>

      <Card title="数据与同步">
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/sync">
            <Button variant="secondary">
              <Cloud size={16} /> 云同步设置
            </Button>
          </Link>
          <Button variant="secondary" onClick={() => downloadBackup(data)}>
            <Download size={16} /> 导出备份
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> 导入备份
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !confirm("导入会用备份文件覆盖本机全部数据（云同步配置除外），确定继续？")) return;
              try {
                setImportError("");
                await importBackup(file);
              } catch (err) {
                setImportError(err instanceof Error ? err.message : "导入失败");
              }
            }}
          />
        </div>
        {importError && <p className="mt-2 text-sm text-red-600">{importError}</p>}
        <p className="mt-2 text-xs text-gray-400">数据保存在本机浏览器（IndexedDB）中。备份文件不含云盘账号密码。</p>
      </Card>
    </div>
  );
}
