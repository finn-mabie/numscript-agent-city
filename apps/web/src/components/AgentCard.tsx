"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

type Hover = { id: string; x: number; y: number } | null;

export default function AgentCard() {
  const [hover, setHover] = useState<Hover>(null);
  const agents = useCityStore((s) => s.agents);

  useEffect(() => {
    const h = (e: Event) => setHover((e as CustomEvent).detail);
    window.addEventListener("nac:agent-hover", h);
    return () => window.removeEventListener("nac:agent-hover", h);
  }, []);

  if (!hover) return null;
  const a = agents[hover.id];
  if (!a) return null;

  return (
    <div
      className="absolute z-10 font-mono text-[11px] bg-ink border border-mute px-3 py-2 pointer-events-none"
      style={{ left: hover.x + 12, top: hover.y - 40 }}
    >
      <div className="font-semibold text-paper">{a.name} <span className="text-dim">· {a.role}</span></div>
      <div className="text-dim text-[10px] italic mt-0.5 max-w-[36ch]">{a.tagline}</div>
      <div className="mt-1 text-paper tabular-nums">${(a.balance / 100).toFixed(2)}{a.hustleMode ? <span className="ml-1.5 text-hustle">♦ hustle</span> : null}</div>
    </div>
  );
}
