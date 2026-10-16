"use client";

import { useState } from "react";
import { WEEKDAY_LABEL } from "@/lib/dates";
import { newSeed } from "@/lib/planner/random";
import { CATEGORY_LABEL, FRIDGE_SLOT_HINT, FRIDGE_SLOT_LABEL, FRIDGE_SLOTS, type FridgeSlot, type Ingredient, type Settings } from "@/lib/schema/data";
import { nearestSpaceLevel, SPACE_LEVELS } from "@/lib/shopping/storage";
import { Badge, cn, Input, Progress, Segmented } from "./ui";

type Shopping = Settings["shopping"];

export function ShoppingScheduleEditor({ value, onChange }: { value: Shopping; onChange: (v: Shopping) => void }) {
  return (
    <div className="space-y-3">
      <Segmented
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: "fixed", label: "固定日期" },
          { value: "random", label: "随机日期" },
          { value: "manual", label: "手动指定" },
        ]}
      />
      {value.mode === "fixed" && (
        <div>
          <p className="mb-2 text-sm text-gray-500">每周在这几天去采购（可多选）：</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = value.fixedWeekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    const next = on ? value.fixedWeekdays.filter((x) => x !== d) : [...value.fixedWeekdays, d].sort();
                    if (next.length > 0) onChange({ ...value, fixedWeekdays: next });
                  }}
                  className={cn("h-10 w-14 rounded-xl text-sm font-medium ring-1", on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-600 ring-gray-200")}
                >
                  {WEEKDAY_LABEL[d]}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {value.mode === "random" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">系统每周随机挑选采购日（两次采购至少间隔 2 天），饮食方案会按采购日安排保质期短的食材。</p>
          <div className="flex items-center gap-3">
            <Segmented
              value={value.randomTimesPerWeek}
              onChange={(randomTimesPerWeek) => onChange({ ...value, randomTimesPerWeek })}
              options={[
                { value: 1, label: "每周 1 次" },
                { value: 2, label: "每周 2 次" },
              ]}
            />
            <button type="button" className="text-sm text-brand-600 hover:underline" onClick={() => onChange({ ...value, seed: newSeed() })}>
              重新随机
            </button>
          </div>
        </div>
      )}
      {value.mode === "manual" && <ManualDates value={value} onChange={onChange} />}
    </div>
  );
}

function ManualDates({ value, onChange }: { value: Shopping; onChange: (v: Shopping) => void }) {
  const [date, setDate] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">添加具体的采购日期：</p>
      <div className="flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-48" />
        <button
          type="button"
          className="rounded-xl bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          disabled={!date || value.manualDates.includes(date)}
          onClick={() => {
            onChange({ ...value, manualDates: [...value.manualDates, date].sort() });
            setDate("");
          }}
        >
          添加
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {value.manualDates.map((d) => (
          <Badge key={d} className="bg-brand-50 text-brand-700 ring-brand-200">
            {d}
            <button type="button" className="ml-1 text-brand-400 hover:text-brand-700" onClick={() => onChange({ ...value, manualDates: value.manualDates.filter((x) => x !== d) })}>
              ×
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function StorageSpaceEditor({
  value,
  onChange,
  occupancy,
}: {
  value: Settings["storageSpace"];
  onChange: (v: Settings["storageSpace"]) => void;
  occupancy?: Partial<Record<FridgeSlot, number>>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">瞄一眼冰箱估一下就行，1 份大约是一盒或一小袋能单独占的位置。</p>
      {FRIDGE_SLOTS.map((slot) => {
        const room = value[slot];
        const need = occupancy?.[slot];
        const over = need !== undefined && need > room;
        return (
          <div key={slot} className="space-y-1.5">
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-gray-800">{FRIDGE_SLOT_LABEL[slot]}</div>
                <div className="text-xs text-gray-400">{FRIDGE_SLOT_HINT[slot]}</div>
              </div>
              {need !== undefined && (
                <span className={cn("text-xs", over ? "font-medium text-amber-700" : "text-gray-500")}>
                  这次约 {need} 份 / 还能放 {room} 份
                </span>
              )}
            </div>
            {need !== undefined && <Progress value={need} max={Math.max(room, 1)} barClassName={over ? "bg-amber-500" : undefined} />}
            <div className="flex flex-wrap gap-1">
              {SPACE_LEVELS.map((level) => {
                const on = nearestSpaceLevel(room) === level.slots;
                return (
                  <button
                    key={level.slots}
                    type="button"
                    onClick={() => onChange({ ...value, [slot]: level.slots })}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium ring-1",
                      on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50",
                    )}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DietExclusionEditor({ ingredients, value, onChange }: { ingredients: Ingredient[]; value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");
  const shown = ingredients.filter((i) => !query || i.name.includes(query) || CATEGORY_LABEL[i.category].includes(query));
  return (
    <div className="space-y-2">
      <Input placeholder="搜索食材，如：牛肉、海鲜" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
        {shown.map((i) => {
          const on = value.includes(i.id);
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => onChange(on ? value.filter((x) => x !== i.id) : [...value, i.id])}
              className={cn("rounded-full px-3 py-1 text-sm ring-1", on ? "bg-red-50 text-red-600 ring-red-200 line-through" : "bg-white text-gray-600 ring-gray-200")}
            >
              {i.name}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400">已排除 {value.length} 种食材，含有这些食材的菜单不会出现在随机方案里。</p>
    </div>
  );
}
