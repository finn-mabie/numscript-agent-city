"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

const ORCH_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? "http://127.0.0.1:3071";

interface LedgerTx {
  id: string;
  timestamp: string | null;
  reference: string | null;
  postings: Array<{ source: string; destination: string; asset: string; amount: number }>;
  metadata: Record<string, string>;
}
interface AgentDetail {
  agent: { id: string; name: string; role: string; tagline: string; color: string; hustleMode: 0 | 1 };
  balance: number;
  metadata: Record<string, string>;
  transactions: LedgerTx[];
  intentLog: Array<{
    agentId: string; tickId: string; reasoning: string; templateId: string | null;
    params: unknown; outcome: string; errorPhase: string | null; errorCode: string | null;
    txId: string | null; createdAt: number;
  }>;
}

export default function AgentPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const agents = useCityStore((s) => s.agents);

  useEffect(() => {
    const h = (e: Event) => setOpenId((e as CustomEvent).detail.id);
    window.addEventListener("nac:agent-click", h);
    return () => window.removeEventListener("nac:agent-click", h);
  }, []);

  // Fetch live detail from the orchestrator (which proxies the ledger) on open;
  // refresh every 10s while the panel is open.
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    let cancelled = false;
    const fetchDetail = async () => {
      try {
        setLoading(true);
        const r = await fetch(`${ORCH_BASE}/agent/${openId}`, { cache: "no-store" });
        const body = await r.json();
        if (!cancelled) setDetail(body as AgentDetail);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDetail();
    const t = setInterval(fetchDetail, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [openId]);

  if (!openId) return null;
  const fallback = agents[openId];
  const a = detail?.agent ?? fallback;
  if (!a) return null;

  const balance = detail?.balance ?? fallback?.balance ?? 0;
  const hustleMode = fallback?.hustleMode ?? a.hustleMode;

  return (
    <aside
      className="absolute z-20 top-0 right-0 h-screen w-[460px] bg-ink border-l border-mute p-5 font-mono text-[12px] overflow-y-auto"
      style={{ animation: "panel-in-right 240ms var(--panel-ease, cubic-bezier(0.2,0.9,0.3,1)) both" }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider text-dim">Agent {a.id}</div>
          <h2 className="text-lg font-semibold text-paper">{a.name}</h2>
          <div className="text-dim text-[11px]">
            {a.role} · <span className="text-paper tabular-nums">${(balance / 100).toFixed(2)}</span>
            {hustleMode ? <span className="ml-1.5 text-hustle">· ♦ hustle</span> : null}
            {loading && <span className="ml-2 text-dim italic">refreshing…</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("nac:arena-open", { detail: { targetAgentId: a.id } }))}
            className="text-[10px] uppercase tracking-wider border border-[var(--scream)] text-[var(--scream)] px-2 py-0.5 hover:bg-[var(--scream)] hover:text-[var(--ink)] transition-colors"
          >
            Attack this agent
          </button>
          <button onClick={() => setOpenId(null)} className="text-dim hover:text-paper text-lg leading-none">×</button>
        </div>
      </div>

      <p className="mt-4 text-paper text-[12px] leading-relaxed">{a.tagline}</p>

      {detail && Object.keys(detail.metadata).length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">On-ledger metadata</h3>
          <pre className="bg-ink border border-mute p-2.5 text-[11px] text-paper whitespace-pre-wrap break-words">
{JSON.stringify(detail.metadata, null, 2)}
          </pre>
        </>
      )}

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">
        Ledger transactions {detail ? `· ${detail.transactions.length}` : ""}
      </h3>
      <ul className="space-y-2">
        {!detail && <li className="text-dim italic">loading from ledger…</li>}
        {detail && detail.transactions.length === 0 && <li className="text-dim italic">no transactions yet</li>}
        {detail?.transactions.map((t) => (
          <li key={t.id} className="border-l-2 border-mute pl-2.5">
            <div className="flex gap-2 items-baseline">
              <span className="text-paper font-medium">tx {t.id}</span>
              <span className="text-dim text-[10px]">{t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : ""}</span>
              {t.metadata?.type && (
                <span className="text-[10px] uppercase tracking-wider text-dim">{t.metadata.type}</span>
              )}
            </div>
            {t.postings.slice(0, 3).map((p, i) => (
              <div key={i} className="text-[11px] tabular-nums pl-1">
                <span className="text-paper">{shortAcct(p.source)}</span>
                <span className="text-dim"> → </span>
                <span className="text-paper">{shortAcct(p.destination)}</span>
                {" "}
                <span style={{ color: "#6fa86a" }}>${(p.amount / 100).toFixed(2)}</span>
              </div>
            ))}
            {t.postings.length > 3 && (
              <div className="text-[10px] text-dim pl-1">+ {t.postings.length - 3} more postings</div>
            )}
          </li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Agent intent log</h3>
      <ul className="space-y-2">
        {(!detail?.intentLog || detail.intentLog.length === 0) && <li className="text-dim italic">no intents logged yet</li>}
        {detail?.intentLog?.slice(0, 20).map((r) => (
          <li key={r.tickId} className="border-l-2 pl-2.5" style={{ borderColor: outcomeColor(r.outcome) }}>
            <div className="text-dim text-[10px]">{new Date(r.createdAt).toLocaleTimeString()}  ·  {r.tickId}</div>
            <div className="text-paper">
              {r.outcome === "committed" && <span className="text-[#6fa86a]">✓ {r.templateId}</span>}
              {r.outcome === "rejected"  && <span className="text-scream">✗ {r.errorCode} <span className="text-dim">({r.errorPhase})</span></span>}
              {r.outcome === "idle"      && <span className="text-dim">idle</span>}
              {r.outcome === "pending"   && <span className="text-dim">⋯ thinking {r.templateId}</span>}
            </div>
            {r.reasoning && <div className="text-dim text-[11px] mt-0.5 italic">&quot;{r.reasoning}&quot;</div>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function shortAcct(addr: string): string {
  const parts = addr.split(":");
  if (parts[0] === "agents" && parts.length >= 3) return `${parts[1]}:${parts[2].slice(0, 5)}`;
  if (parts[0] === "platform") return parts.slice(0, 3).map((p) => p.slice(0, 6)).join(":");
  return parts.slice(0, 3).map((p) => p.slice(0, 6)).join(":");
}

function outcomeColor(o: string): string {
  if (o === "committed") return "#6fa86a";
  if (o === "rejected") return "#ec3a2d";
  if (o === "pending") return "#6e6a62";
  return "#3a3732";
}
