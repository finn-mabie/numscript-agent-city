"use client";
import React from "react";
import { GlyphAdapter, GlyphCommitEvent, GlyphRejectEvent } from "../store-adapter";
import { glyphOf } from "../agent-map";

interface TickerRow {
  kind: "commit" | "reject";
  from: string;
  to: string;
  amount: number;
  txid: string;
  barrier?: "schema" | "overdraft" | "unknown" | "seen";
}

const BARRIER_SIG: Record<string, string> = { schema: "⬡", overdraft: "⊘", unknown: "404", seen: "⟳" };
const BARRIER_HEX: Record<string, string> = { schema: "#60D6CE", overdraft: "#E5534B", unknown: "#E8A84A", seen: "#B79BD9" };

export default function TickerRail({ adapter }: { adapter: GlyphAdapter }) {
  const [rows, setRows] = React.useState<TickerRow[]>([]);

  React.useEffect(() => {
    const onCommit = ({ from, to, amount, txid }: GlyphCommitEvent) => {
      setRows((prev: TickerRow[]) => [{ kind: "commit" as const, from, to, amount, txid }, ...prev].slice(0, 10));
    };
    const onReject = ({ from, to, amount, txid, barrier }: GlyphRejectEvent) => {
      setRows((prev: TickerRow[]) => [{ kind: "reject" as const, from, to, amount, txid, barrier }, ...prev].slice(0, 10));
    };
    adapter.on("commit", onCommit as Parameters<typeof adapter.on>[1]);
    adapter.on("reject", onReject as Parameters<typeof adapter.on>[1]);
    return () => {
      adapter.off("commit", onCommit as Parameters<typeof adapter.on>[1]);
      adapter.off("reject", onReject as Parameters<typeof adapter.on>[1]);
    };
  }, [adapter]);

  return (
    <div className="tk">
      <div className="tk-lbl">_TICKER/</div>
      <div className="tk-rows">
        {rows.map((r, i) => (
          <div key={r.txid + "-" + i} className="tk-row">
            <span className="tk-tx">{r.txid}</span>
            <span className="tk-who">{glyphOf(r.from)}→{typeof r.to === "string" && r.to.length === 1 ? glyphOf(r.to) : r.to}</span>
            {r.kind === "commit"
              ? <span className="tk-amt" style={{ color: "#BAEABC" }}>✓{r.amount > 0 ? ` $${r.amount}` : ""}</span>
              : <span className="tk-amt" style={{ color: r.barrier ? BARRIER_HEX[r.barrier] : "#E5534B" }}>{r.barrier ? BARRIER_SIG[r.barrier] : "⊘"}{r.amount > 0 ? ` $${r.amount}` : ""}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
