"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

export default function TxPanel() {
  const [tickId, setTickId] = useState<string | null>(null);
  const recent = useCityStore((s) => s.recent);

  useEffect(() => {
    const h = (e: Event) => setTickId((e as CustomEvent).detail.tickId);
    window.addEventListener("nac:tx-click", h);
    return () => window.removeEventListener("nac:tx-click", h);
  }, []);

  if (!tickId) return null;
  const r = recent.find((x) => x.tickId === tickId);
  if (!r) return null;

  return (
    <aside
      className="absolute z-20 top-0 left-0 h-screen w-[460px] bg-ink border-r border-mute p-5 font-mono text-[12px] overflow-y-auto"
      style={{ animation: "panel-in-left 240ms var(--panel-ease, cubic-bezier(0.2,0.9,0.3,1)) both" }}
    >
      <div className="flex justify-between items-baseline">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dim">Transaction</div>
          <h2 className="text-lg font-semibold text-paper">{r.templateId}</h2>
          <div className="text-dim text-[11px]">{r.tickId}  ·  agent {r.agentId}{r.txId ? `  ·  tx ${r.txId}` : ""}</div>
        </div>
        <button onClick={() => setTickId(null)} className="text-dim hover:text-paper text-lg leading-none">×</button>
      </div>

      {r.reasoning && (
        <div className="mt-3 text-[11px] italic text-dim">&quot;{r.reasoning}&quot;</div>
      )}

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Parameters</h3>
      <pre className="bg-ink border border-mute p-2.5 whitespace-pre-wrap break-words text-[11px] text-paper">
{r.params ? JSON.stringify(r.params, null, 2) : "(no params recorded)"}
      </pre>

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Outcome</h3>
      <div className="text-paper">
        {r.outcome === "pending"   && <span className="text-dim">⋯ pending (LLM picked tool; cage evaluating)</span>}
        {r.outcome === "committed" && <span className="text-[#6fa86a]">✓ committed</span>}
        {r.outcome === "rejected"  && <span className="text-scream">✗ {r.errorCode} <span className="text-dim">({r.errorPhase})</span></span>}
        {r.outcome === "idle"      && <span className="text-dim">idle</span>}
      </div>

      {r.txId && (
        <>
          <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Audit</h3>
          <LedgerLink txId={r.txId} />
        </>
      )}
    </aside>
  );
}

function LedgerLink({ txId }: { txId: string }) {
  const base = process.env.NEXT_PUBLIC_LEDGER_EXPLORER_URL; // e.g. https://<stack>.console.demo.dev.formance.cloud/ledger/city/transactions
  const local = process.env.NEXT_PUBLIC_LEDGER_URL ?? "http://localhost:3068";
  const ledger = process.env.NEXT_PUBLIC_LEDGER_NAME ?? "city";
  const href = base
    ? `${base.replace(/\/$/, "")}/${encodeURIComponent(txId)}`
    : `${local}/v2/${ledger}/transactions/${encodeURIComponent(txId)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1.5 text-[11px] text-paper border-b border-dim hover:border-paper pb-[1px]"
    >
      view tx {txId} <span className="text-dim">↗</span>
    </a>
  );
}
