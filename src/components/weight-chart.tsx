"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WeightLog } from "@/lib/schema/data";

export function WeightChart({ logs, baseline, target, height = 220 }: { logs: WeightLog[]; baseline?: number; target?: number; height?: number }) {
  const data = [...logs].sort((a, b) => a.date.localeCompare(b.date)).slice(-60).map((l) => ({ date: l.date.slice(5), weight: l.weightKg }));
  if (data.length === 0) return <p className="py-8 text-center text-sm text-gray-400">还没有体重记录</p>;
  const values = data.map((d) => d.weight).concat(baseline ? [baseline - 1.2, baseline + 1.2] : [], target ? [target] : []);
  const min = Math.floor(Math.min(...values) - 0.5);
  const max = Math.ceil(Math.max(...values) + 0.5);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#9ca3af" }} />
        <YAxis domain={[min, max]} tick={{ fontSize: 11, fill: "#9ca3af" }} />
        <Tooltip formatter={(v) => [`${v} kg`, "体重"]} />
        {baseline !== undefined && <ReferenceArea y1={baseline - 1} y2={baseline + 1} fill="var(--brand-100)" fillOpacity={0.6} />}
        {baseline !== undefined && <ReferenceLine y={baseline} stroke="var(--brand-500)" strokeDasharray="4 4" />}
        {target !== undefined && <ReferenceLine y={target} stroke="var(--brand-600)" strokeDasharray="4 4" label={{ value: "目标", fontSize: 11, fill: "var(--brand-700)" }} />}
        <Line type="monotone" dataKey="weight" stroke="var(--brand-600)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default WeightChart;
