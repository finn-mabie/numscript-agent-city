"use client";
import React from "react";
import { GlyphAdapter, GlyphTickEvent } from "../store-adapter";

export default function BottomRail({ adapter }: { adapter: GlyphAdapter }) {
  const [s, setS] = React.useState<GlyphTickEvent>({ commits: 0, rejects: 0, tick: 0 });

  React.useEffect(() => {
    const fn = (p: GlyphTickEvent) => setS(p);
    adapter.on("tick", fn as Parameters<typeof adapter.on>[1]);
    return () => adapter.off("tick", fn as Parameters<typeof adapter.on>[1]);
  }, [adapter]);

  const total = s.commits + s.rejects;
  const cPct = total ? (s.commits / total * 100).toFixed(1) : "0.0";
  const rPct = total ? (s.rejects / total * 100).toFixed(1) : "0.0";
  const totalEvents = s.commits + s.rejects;
  const txPerMin = s.tick > 0 ? (totalEvents / s.tick).toFixed(1) : "0.0";

  return (
    <div className="br">
      <span>AGENTS 10/10</span>
      <span>TX/MIN {txPerMin}</span>
      <span style={{ color: "#BAEABC" }}>COMMIT {cPct}%</span>
      <span style={{ color: "#E5534B" }}>REJECT {rPct}%</span>
      <span className="br-spacer" />
      <span>_LIVE/ · ONE TYPOGRAPHIC SURFACE</span>
    </div>
  );
}
