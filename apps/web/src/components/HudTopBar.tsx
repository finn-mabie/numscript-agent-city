"use client";
import { useCityStore } from "../state/city-store";
import { useEffect, useState } from "react";

function fmtUsd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function useUptime(bootedAt: number): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - bootedAt) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export default function HudTopBar() {
  const agents = useCityStore((s) => s.agents);
  const ticksToday = useCityStore((s) => s.ticksToday);
  const rejectedToday = useCityStore((s) => s.rejectedToday);
  const bootedAt = useCityStore((s) => s.bootedAt);

  const total = Object.values(agents).reduce((sum, a) => sum + a.balance, 0);
  const uptime = useUptime(bootedAt);

  return (
    <div className="absolute inset-x-0 top-0 px-5 py-3 flex justify-between items-center font-mono text-[11px] text-paper bg-ink border-b border-mute pointer-events-none select-none">
      <div className="flex items-center gap-2.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-scream" style={{ boxShadow: "0 0 8px var(--scream)" }} />
        <span className="font-semibold tracking-[0.15em] text-paper">NUMSCRIPT · AGENT CITY</span>
      </div>
      <div className="flex gap-7 items-baseline">
        <Stat label="in circulation" value={fmtUsd(total)} />
        <Stat label="ticks" value={String(ticksToday)} kind="tick" changeKey={ticksToday} />
        <Stat label="rejected" value={String(rejectedToday)} kind="reject" changeKey={rejectedToday} />
        <Stat label="uptime" value={uptime} />
      </div>
    </div>
  );
}

function Stat({ label, value, kind, changeKey }: { label: string; value: string; kind?: "tick" | "reject"; changeKey?: number }) {
  const [pulseCount, setPulseCount] = useState(0);
  useEffect(() => { setPulseCount((n) => n + 1); }, [changeKey]);
  const animation = kind === "reject" ? "reject-pulse 200ms ease-out"
                  : kind === "tick"   ? "tick-pulse 200ms ease-out"
                  : "none";
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        key={`${label}-${pulseCount}`}
        className="tabular-nums text-paper text-[13px] font-medium inline-block"
        style={{ animation }}
      >
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-[0.18em] text-dim">{label}</span>
    </div>
  );
}
