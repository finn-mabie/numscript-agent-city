"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

export default function AgentPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const agents = useCityStore((s) => s.agents);
  const recent = useCityStore((s) => s.recent);

  useEffect(() => {
    const h = (e: Event) => setOpenId((e as CustomEvent).detail.id);
    window.addEventListener("nac:agent-click", h);
    return () => window.removeEventListener("nac:agent-click", h);
  }, []);

  if (!openId) return null;
  const a = agents[openId];
  if (!a) return null;

  const entries = recent.filter((r) => r.agentId === a.id).slice(0, 25);

  return (
    <aside
      className="absolute z-20 top-0 right-0 h-screen w-[420px] bg-ink border-l border-mute p-5 font-mono text-[12px] overflow-y-auto"
      style={{ animation: "panel-in-right 240ms var(--panel-ease, cubic-bezier(0.2,0.9,0.3,1)) both" }}
    >
      <div className="flex justify-between items-baseline">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dim">Agent {a.id}</div>
          <h2 className="text-lg font-semibold text-paper">{a.name}</h2>
          <div className="text-dim text-[11px]">{a.role} · ${(a.balance / 100).toFixed(2)}{a.hustleMode ? " · ♦ hustle" : ""}</div>
        </div>
        <button onClick={() => setOpenId(null)} className="text-dim hover:text-paper text-lg leading-none">×</button>
      </div>

      <p className="mt-3 italic text-dim">{a.tagline}</p>

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Intent log</h3>
      <ul className="space-y-2">
        {entries.length === 0 && <li className="text-dim italic">no events yet</li>}
        {entries.map((r) => (
          <li key={r.tickId} className="border-l-2 pl-2" style={{ borderColor: outcomeColor(r.outcome) }}>
            <div className="text-dim text-[10px]">{new Date(r.createdAt).toLocaleTimeString()}  ·  {r.tickId}</div>
            <div className="text-paper">
              {r.outcome === "committed" && <span className="text-[#6fa86a]">✓ {r.templateId}</span>}
              {r.outcome === "rejected"  && <span className="text-scream">✗ {r.errorCode} <span className="text-dim">({r.errorPhase})</span></span>}
              {r.outcome === "idle"      && <span className="text-dim">idle</span>}
            </div>
            {r.reasoning && <div className="text-dim text-[11px] mt-0.5 italic">&quot;{r.reasoning}&quot;</div>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function outcomeColor(o: string): string {
  if (o === "committed") return "#6fa86a";
  if (o === "rejected") return "#ec3a2d";
  return "#3a3732";
}
