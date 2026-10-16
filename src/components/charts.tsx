"use client";

import { Bar, BarChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function Ring({
  value,
  max,
  label,
  unit,
  size = 96,
  color = "var(--brand-500)",
  warnOver = true,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  size?: number;
  color?: string;
  /** 超过目标 10% 时标红；蛋白质这类"下限型"目标应关闭 */
  warnOver?: boolean;
}) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f1f5f9" strokeWidth={8} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={warnOver && value > max * 1.1 ? "#f87171" : color}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-all"
        />
      </svg>
      <div className="-mt-[66px] mb-6 text-center" style={{ height: 42 }}>
        <div className="text-base font-bold">{Math.round(value)}</div>
        <div className="text-[10px] text-gray-400">
          / {Math.round(max)} {unit}
        </div>
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

export function WeekKcalChart({ data, target }: { data: { day: string; kcal: number }[]; target: number }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#9ca3af" }} />
        <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} />
        <Tooltip formatter={(v) => [`${Math.round(Number(v))} 千卡`, "计划"]} />
        <ReferenceLine y={target} stroke="var(--brand-700)" strokeDasharray="4 4" />
        <Bar dataKey="kcal" fill="var(--brand-500)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FoodGroupRadar({ data }: { data: { group: string; pct: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="group" tick={{ fontSize: 11, fill: "#6b7280" }} />
        <Tooltip formatter={(v) => [`${v}%`, "达成"]} />
        <Radar dataKey="pct" stroke="var(--brand-600)" fill="var(--brand-500)" fillOpacity={0.35} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
