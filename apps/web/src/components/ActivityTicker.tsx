"use client";
import { useCityStore } from "../state/city-store";

/**
 * A fixed bottom-left panel that scrolls the most recent events in real time.
 * Each tick has ONE entry — goes "pending" when the LLM picks a template, then
 * transitions to committed / rejected / idle as the cage either approves or
 * rejects. Makes agent activity impossible to miss without dominating the
 * canvas.
 */
export default function ActivityTicker() {
  const recent = useCityStore((s) => s.recent);
  const agents = useCityStore((s) => s.agents);
  const entries = recent.slice(0, 12);

  return (
    <div className="absolute bottom-5 left-5 font-mono text-[11px] pointer-events-none space-y-[2px] max-w-[520px]">
      <div className="text-[9px] uppercase tracking-[0.2em] text-dim mb-1.5">activity · live</div>
      {entries.length === 0 ? (
        <div className="text-dim italic">no events yet — agents waking up…</div>
      ) : (
        entries.map((r, i) => {
          const opacity = Math.max(0.25, 1 - i * 0.075);
          const name = agents[r.agentId]?.name ?? `agent ${r.agentId}`;
          return (
            <div key={r.tickId} className="flex gap-2 items-baseline tabular-nums" style={{ opacity }}>
              <span className="text-dim text-[10px]">{new Date(r.createdAt).toTimeString().slice(0, 8)}</span>
              <span className="text-paper w-[52px] shrink-0">{name}</span>
              {r.outcome === "pending" && (
                <span className="text-dim">
                  <span className="inline-block w-2 animate-pulse">⋯</span> thinking <span className="text-paper">{r.templateId}</span>
                </span>
              )}
              {r.outcome === "committed" && (
                <span style={{ color: "#6fa86a" }}>
                  ✓ <span className="text-paper">{r.templateId}</span>
                </span>
              )}
              {r.outcome === "rejected" && (
                <span className="text-scream">
                  ✗ {r.errorCode} <span className="text-dim">({r.errorPhase})</span>
                </span>
              )}
              {r.outcome === "idle" && <span className="text-dim">idle</span>}
            </div>
          );
        })
      )}
    </div>
  );
}
