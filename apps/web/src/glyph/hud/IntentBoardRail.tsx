"use client";
import React from "react";
import { GlyphAdapter, GlyphIntentEvent, GlyphCommitEvent, GlyphRejectEvent } from "../store-adapter";
import { glyphOf, hexOf } from "../agent-map";

interface Thread {
  id: string;
  from: string;
  to: string;
  amount: number;
  summary: string;
  replies: Array<{ from: string; summary: string }>;
  state: "open" | "committed" | "rejected";
  judy?: boolean;
  txid?: string;
  barrier?: "schema" | "overdraft" | "unknown" | "seen";
}

interface LogRow {
  kind: "commit" | "reject";
  from: string;
  to: string;
  amount: number;
  txid: string;
  barrier?: "schema" | "overdraft" | "unknown" | "seen";
}

const BARRIER_SIG: Record<string, string> = { schema: "⬡", overdraft: "⊘", unknown: "404", seen: "⟳" };
const BARRIER_HEX: Record<string, string> = { schema: "#60D6CE", overdraft: "#E5534B", unknown: "#E8A84A", seen: "#B79BD9" };

export default function IntentBoardRail({ adapter }: { adapter: GlyphAdapter }) {
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [flatLog, setFlatLog] = React.useState<LogRow[]>([]);

  React.useEffect(() => {
    const onIntent = ({ id, from, to, kind, summary, amount, judy, parent }: GlyphIntentEvent) => {
      setThreads((prev: Thread[]) => {
        const copy = [...prev];
        if (kind === "offer") {
          copy.unshift({ id, from, to, amount, summary, replies: [], state: "open", judy });
          return copy.slice(0, 12);
        } else if (kind === "reply") {
          const t = copy.find((x) => x.id === parent);
          if (t) t.replies.push({ from, summary });
          return copy;
        }
        return prev;
      });
    };
    const onCommit = ({ id, from, to, amount, txid }: GlyphCommitEvent) => {
      setThreads((prev: Thread[]) => prev.map((t) => t.id === id ? { ...t, state: "committed" as const, txid } : t));
      setFlatLog((prev: LogRow[]) => [{ kind: "commit" as const, from, to, amount, txid }, ...prev].slice(0, 18));
    };
    const onReject = ({ id, from, to, amount, txid, barrier }: GlyphRejectEvent) => {
      setThreads((prev: Thread[]) => prev.map((t) => t.id === id ? { ...t, state: "rejected" as const, txid, barrier } : t));
      setFlatLog((prev: LogRow[]) => [{ kind: "reject" as const, from, to, amount, txid, barrier }, ...prev].slice(0, 18));
    };
    adapter.on("intent", onIntent as Parameters<typeof adapter.on>[1]);
    adapter.on("commit", onCommit as Parameters<typeof adapter.on>[1]);
    adapter.on("reject", onReject as Parameters<typeof adapter.on>[1]);
    return () => {
      adapter.off("intent", onIntent as Parameters<typeof adapter.on>[1]);
      adapter.off("commit", onCommit as Parameters<typeof adapter.on>[1]);
      adapter.off("reject", onReject as Parameters<typeof adapter.on>[1]);
    };
  }, [adapter]);

  return (
    <div className="ib">
      <div className="ib-head">_INTENT-BOARD/</div>
      <div className="ib-threads">
        {threads.slice(0, 6).map((t) => (
          <div key={t.id} className={`ib-thread ib-${t.state} ${t.judy ? "ib-judy" : ""}`}>
            <div className="ib-root">
              <span className="ib-tag" style={{ color: t.judy ? "#E5534B" : "#D4A24A" }}>
                {t.judy ? "⚠ ATTEMPT" : "◆ OFFER"}
              </span>
              <span className="ib-who" style={{ color: hexOf(t.from) }}>
                {glyphOf(t.from)} {t.judy ? "" : "→"} {t.judy ? "" : glyphOf(t.to)}
              </span>
              <span className="ib-amt">${t.amount}</span>
              <div className="ib-sum">{t.summary}</div>
              {t.state === "committed" && (
                <div className="ib-state" style={{ color: "#BAEABC" }}>✓ COMMIT {t.txid}</div>
              )}
              {t.state === "rejected" && t.barrier && (
                <div className="ib-state" style={{ color: BARRIER_HEX[t.barrier] }}>
                  {BARRIER_SIG[t.barrier]} {t.barrier.toUpperCase()} {t.txid}
                </div>
              )}
            </div>
            {t.replies.map((r, i) => (
              <div key={i} className="ib-reply">
                <span className="ib-connector" />
                <span className="ib-tag" style={{ color: "#A6BEC0" }}>↘ REPLY</span>
                <span className="ib-who" style={{ color: hexOf(r.from) }}>{glyphOf(r.from)}</span>
                <div className="ib-sum">{r.summary}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="ib-log-head">_LOG/</div>
      <div className="ib-log">
        {flatLog.map((l, i) => (
          <div key={i} className="ib-log-row">
            {l.kind === "commit" ? (
              <>
                <span style={{ color: "#BAEABC" }}>✓ COMMIT {l.txid}</span>
                <span style={{ color: "#7A9396" }}>{glyphOf(l.from)}→{glyphOf(l.to)}</span>
                <span style={{ color: "#D5E1E1" }}>${l.amount}</span>
              </>
            ) : (
              <>
                <span style={{ color: l.barrier ? BARRIER_HEX[l.barrier] : "#E5534B" }}>
                  {l.barrier ? BARRIER_SIG[l.barrier] : "⊘"} {(l.barrier || "").toUpperCase()} {l.txid}
                </span>
                <span style={{ color: "#7A9396" }}>{glyphOf(l.from)}→{l.to}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
