"use client";

import { Bar, BarChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
