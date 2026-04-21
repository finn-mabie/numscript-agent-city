"use client";
import { useEffect, useState, useMemo } from "react";
import { useCityStore } from "../state/city-store";

export default function BoardPanel() {
  const [open, setOpen] = useState(false);
  const offers = useCityStore((s) => s.offers);
  const agents = useCityStore((s) => s.agents);

  // Toggle on "b" key unless focused in an input/textarea/select; also on window event
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const tag = (ev.target as HTMLElement | null)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (ev.key === "b" && !inInput) {
        ev.preventDefault();
        setOpen((v) => !v);
      }
      if (ev.key === "Escape" && open) {
        ev.preventDefault();
        setOpen(false);
      }
    }
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("keydown", onKey);
    window.addEventListener("nac:board-toggle", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("nac:board-toggle", onToggle);
    };
  }, [open]);

  // Group offers by thread: root id → { root, replies[] }. Show only roots whose
  // status !== "expired" (closed-but-not-expired threads stay visible with a badge).
  const threads = useMemo(() => {
    const byId = offers;
    const roots = Object.values(byId)
      .filter((o) => !o.inReplyTo)
      .filter((o) => o.status !== "expired")
      .sort((a, b) => b.createdAt - a.createdAt);
    return roots.map((root) => ({
      root,
      replies: Object.values(byId)
        .filter((o) => o.inReplyTo === root.id)
        .sort((a, b) => a.createdAt - b.createdAt)
    }));
  }, [offers]);

  if (!open) return null;

  return (
    <aside
      className="absolute z-20 bottom-24 left-5 w-[420px] max-h-[55vh] bg-ink border border-mute p-4 font-mono text-[12px] overflow-y-auto"
      style={{ animation: "panel-in-left 240ms var(--panel-ease, cubic-bezier(0.2,0.9,0.3,1)) both" }}
      role="dialog"
      aria-label="Intent board"
    >
      <div className="flex justify-between items-baseline mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dim">Intent board</div>
          <h2 className="text-lg font-semibold text-paper">
            {threads.length} thread{threads.length === 1 ? "" : "s"}
          </h2>
        </div>
        <button onClick={() => setOpen(false)} className="text-dim hover:text-paper text-lg leading-none">×</button>
      </div>

      {threads.length === 0 && (
        <div className="text-dim italic">no posts yet — agents will start talking shortly</div>
      )}

      <ul className="space-y-4">
        {threads.map(({ root, replies }) => (
          <li key={root.id} className="border-l-2 border-mute pl-2.5">
            <OfferRow offer={root} agents={agents} isRoot />
            {replies.map((r) => (
              <div key={r.id} className="ml-5 mt-1.5">
                <OfferRow offer={r} agents={agents} isRoot={false} />
              </div>
            ))}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function OfferRow({ offer, agents, isRoot }: {
  offer: import("../state/city-store").OfferView;
  agents: Record<string, import("../state/city-store").AgentView>;
  isRoot: boolean;
}) {
  const a = agents[offer.authorAgentId];
  const dot = a?.color ?? "#888";
  const ageSec = Math.max(0, Math.floor((Date.now() - offer.createdAt) / 1000));
  const age = ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`;
  return (
    <div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: dot }} />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("nac:agent-click", { detail: { id: offer.authorAgentId } }))}
          className="text-paper underline decoration-dim hover:decoration-paper"
        >
          {a?.name ?? offer.authorAgentId}
        </button>
        <span className="text-dim text-[10px]">{age}</span>
        {offer.status === "closed" && (
          <span className="text-[10px] text-[#6fa86a]">
            ✓ closed{offer.closedByTx ? ` · tx ${offer.closedByTx}` : ""}
          </span>
        )}
        {offer.status === "expired" && (
          <span className="text-[10px] text-dim">expired</span>
        )}
      </div>
      <div className={`text-[11px] mt-0.5 ${isRoot ? "text-paper" : "text-paper/90"}`}>{offer.text}</div>
      <div className="text-[9px] text-dim font-mono mt-0.5">{offer.id}</div>
    </div>
  );
}
