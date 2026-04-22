"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

const ORCH = process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";

interface TemplateDoc {
  id: string;
  source: string;
  schema: unknown;
  example: unknown;
  readme: string | null;
}

export default function TxPanel() {
  const [tickId, setTickId] = useState<string | null>(null);
  const [templateOnlyId, setTemplateOnlyId] = useState<string | null>(null);
  const [tmpl, setTmpl] = useState<TemplateDoc | null>(null);
  const [tmplError, setTmplError] = useState<string | null>(null);
  const recent = useCityStore((s) => s.recent);

  useEffect(() => {
    const tx = (e: Event) => {
      setTickId((e as CustomEvent).detail.tickId);
      setTemplateOnlyId(null);
    };
    const tmplEvt = (e: Event) => {
      setTemplateOnlyId((e as CustomEvent).detail.templateId);
      setTickId(null);
    };
    window.addEventListener("nac:tx-click", tx);
    window.addEventListener("nac:template-click", tmplEvt);
    return () => {
      window.removeEventListener("nac:tx-click", tx);
      window.removeEventListener("nac:template-click", tmplEvt);
    };
  }, []);

  const r = tickId ? recent.find((x) => x.tickId === tickId) : null;

  const activeTemplateId = r?.templateId ?? templateOnlyId;

  // Fetch the template source whenever a new templateId is shown.
  useEffect(() => {
    setTmpl(null);
    setTmplError(null);
    if (!activeTemplateId) return;
    const ctrl = new AbortController();
    fetch(`${ORCH}/template/${activeTemplateId}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc: TemplateDoc = await res.json();
        setTmpl(doc);
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        setTmplError(e.message);
      });
    return () => ctrl.abort();
  }, [activeTemplateId]);

  if (!tickId && !templateOnlyId) return null;

  // Template-only mode: no associated tx entry
  if (templateOnlyId && !r) {
    return (
      <aside
        className="absolute z-20 top-0 left-0 h-screen w-[460px] bg-ink border-r border-mute p-5 font-mono text-[12px] overflow-y-auto"
        style={{ animation: "panel-in-left 240ms var(--panel-ease, cubic-bezier(0.2,0.9,0.3,1)) both" }}
      >
        <div className="flex justify-between items-baseline">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-dim">Numscript template</div>
            <h2 className="text-lg font-semibold text-paper">{templateOnlyId}</h2>
            <div className="text-dim text-[11px]">{templateOnlyId}.num · read-only</div>
          </div>
          <button onClick={() => { setTemplateOnlyId(null); setTickId(null); }} className="text-dim hover:text-paper text-lg leading-none">×</button>
        </div>

        {tmplError && (
          <div className="mt-4 text-[11px] text-scream">Could not load template: {tmplError}</div>
        )}
        {!tmpl && !tmplError && (
          <div className="mt-4 text-[11px] text-dim italic">loading template source…</div>
        )}
        {tmpl && (
          <>
            {tmpl.readme && (
              <div className="mt-4 text-[11px] text-paper leading-relaxed whitespace-pre-wrap">
                {tmpl.readme}
              </div>
            )}
            <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Numscript source</h3>
            <pre className="bg-ink border border-mute p-2.5 whitespace-pre-wrap text-[11px] leading-relaxed text-paper overflow-x-auto">
              {highlightNumscript(tmpl.source)}
            </pre>
            {tmpl.example && (
              <>
                <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Example params</h3>
                <pre className="bg-ink border border-mute p-2.5 whitespace-pre-wrap break-words text-[11px] text-paper">
                  {JSON.stringify(tmpl.example, null, 2)}
                </pre>
              </>
            )}
          </>
        )}
      </aside>
    );
  }

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
        <button onClick={() => { setTickId(null); setTemplateOnlyId(null); }} className="text-dim hover:text-paper text-lg leading-none">×</button>
      </div>

      {r.reasoning && (
        <div className="mt-3 text-[11px] italic text-dim">&quot;{r.reasoning}&quot;</div>
      )}

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Parameters</h3>
      <pre className="bg-ink border border-mute p-2.5 whitespace-pre-wrap break-words text-[11px] text-paper">
{r.params ? JSON.stringify(r.params, null, 2) : "(no params recorded)"}
      </pre>

      {r.templateId && (
        <>
          <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim flex items-baseline gap-2">
            <span>Numscript · template source</span>
            <span className="text-[9px] normal-case tracking-normal text-dim/60">({r.templateId}.num)</span>
          </h3>
          {tmplError && (
            <div className="text-[11px] text-scream">Could not load template: {tmplError}</div>
          )}
          {!tmpl && !tmplError && (
            <div className="text-[11px] text-dim italic">loading template source…</div>
          )}
          {tmpl && (
            <pre className="bg-ink border border-mute p-2.5 whitespace-pre-wrap text-[11px] leading-relaxed text-paper overflow-x-auto">
{highlightNumscript(tmpl.source)}
            </pre>
          )}
        </>
      )}

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

/**
 * Lightweight syntax highlighter for Numscript. Returns a JSX fragment with
 * keywords/comments/strings/vars color-coded using design tokens. Not a full
 * lexer — just enough visual scaffolding to make the template readable at a
 * glance. Falls back gracefully: unknown text renders plainly.
 */
function highlightNumscript(src: string): React.ReactNode {
  const KEYWORDS = /\b(vars|send|source|destination|set_tx_meta|allocating|to|remaining|max|monetary|account|string|number|portion|asset)\b/g;
  const lines = src.split("\n");
  return lines.map((line, lineIdx) => {
    // Full-line comment
    if (/^\s*\/\//.test(line)) {
      return (
        <span key={lineIdx} style={{ color: "var(--dim)", fontStyle: "italic" }}>
          {line}
          {"\n"}
        </span>
      );
    }
    const parts: Array<{ text: string; color?: string; bold?: boolean }> = [];
    let remaining = line;
    const push = (text: string, color?: string, bold?: boolean) => {
      if (text) parts.push({ text, color, bold });
    };
    while (remaining.length > 0) {
      // String literal "..."
      const strMatch = remaining.match(/^"[^"]*"/);
      if (strMatch) { push(strMatch[0], "#d9a86a"); remaining = remaining.slice(strMatch[0].length); continue; }
      // Template variable $foo
      const varMatch = remaining.match(/^\$[a-zA-Z_][a-zA-Z0-9_]*/);
      if (varMatch) { push(varMatch[0], "var(--gold)"); remaining = remaining.slice(varMatch[0].length); continue; }
      // Account literal @name[:sub]
      const acctMatch = remaining.match(/^@[a-zA-Z_][a-zA-Z0-9_:]*/);
      if (acctMatch) { push(acctMatch[0], "#6fa8dc"); remaining = remaining.slice(acctMatch[0].length); continue; }
      // Number / percentage
      const numMatch = remaining.match(/^[0-9]+(\.[0-9]+)?%?/);
      if (numMatch) { push(numMatch[0], "#b5d29a"); remaining = remaining.slice(numMatch[0].length); continue; }
      // Keyword run (check at word boundary)
      KEYWORDS.lastIndex = 0;
      const kwTest = remaining.match(/^([a-z_][a-z0-9_]*)/i);
      if (kwTest && /\b(vars|send|source|destination|set_tx_meta|allocating|to|remaining|max|monetary|account|string|number|portion|asset)\b/.test(kwTest[1])) {
        push(kwTest[1], "#c27ba0", true);
        remaining = remaining.slice(kwTest[1].length);
        continue;
      }
      // Inline comment // ...
      if (remaining.startsWith("//")) { push(remaining, "var(--dim)"); remaining = ""; continue; }
      // Otherwise emit one char
      push(remaining[0]);
      remaining = remaining.slice(1);
    }
    return (
      <span key={lineIdx}>
        {parts.map((p, i) => (
          <span key={i} style={{ color: p.color, fontWeight: p.bold ? 600 : undefined }}>
            {p.text}
          </span>
        ))}
        {"\n"}
      </span>
    );
  });
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
