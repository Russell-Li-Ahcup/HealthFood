"use client";

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

export function ChartPlaceholder({ height }: { height: number }) {
  return <div className="animate-pulse rounded-xl bg-gray-50" style={{ height }} />;
}
