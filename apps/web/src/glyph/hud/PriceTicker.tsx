"use client";
import { useCityStore } from "../../state/city-store";

const ASSET_META: Record<string, { emoji: string }> = {
  "STRAWBERRY/0":  { emoji: "🍓" },
  "COMPUTEHOUR/0": { emoji: "💻" },
  "EUR/2":         { emoji: "€" },
  "USD/2":         { emoji: "$" }
};

function fmtVwap(v: number | null): string {
  if (v === null) return "—";
  return `$${(v / 100).toFixed(2)}`;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <svg width="60" height="14" />;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const d = points.map((v, i) => {
    const x = (i / (points.length - 1)) * 58 + 1;
    const y = 13 - ((v - min) / range) * 12;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="60" height="14" className="inline-block align-middle">
      <path d={d} stroke="#BAEABC" strokeWidth="1" fill="none" />
    </svg>
  );
}

export default function PriceTicker() {
  const market = useCityStore((s) => s.market);
  const items = Object.values(market).filter((m) => ASSET_META[m.assetCode]);
  if (items.length === 0) {
    return <span className="text-[10px] text-dim italic">market: collecting…</span>;
  }
  return (
    <span className="flex gap-4 items-center text-[10px] tabular-nums">
      {items.map((m) => {
        const meta = ASSET_META[m.assetCode];
        const hasTarget = m.target !== null && (m.targetExpiresAt ?? 0) > Date.now();
        return (
          <span key={m.assetCode} className="flex items-center gap-1">
            <span>{meta.emoji}</span>
            <span>{fmtVwap(m.vwap)}</span>
            <Sparkline points={m.vwapHistory} />
            {hasTarget && <span style={{ color: "#D4A24A" }}>🎯 {fmtVwap(m.target)}</span>}
          </span>
        );
      })}
    </span>
  );
}
