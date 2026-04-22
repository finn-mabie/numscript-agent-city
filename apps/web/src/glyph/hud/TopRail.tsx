"use client";
import React from "react";
import { GlyphAdapter, GlyphTickEvent } from "../store-adapter";

export default function TopRail({ adapter }: { adapter: GlyphAdapter }) {
  const [s, setS] = React.useState<GlyphTickEvent>({ tick: 0, commits: 0, rejects: 0 });

  React.useEffect(() => {
    const fn = ({ tick, commits, rejects }: GlyphTickEvent) => setS({ tick, commits, rejects });
    adapter.on("tick", fn as Parameters<typeof adapter.on>[1]);
    return () => adapter.off("tick", fn as Parameters<typeof adapter.on>[1]);
  }, [adapter]);

  return (
    <div className="tr">
      <span className="tr-brand">_NUMSCRIPT.CITY/</span>
      <span className="tr-dim">TICK {s.tick.toLocaleString()}</span>
      <span className="tr-dim">COMMIT {s.commits.toLocaleString()}</span>
      <span className="tr-red">REJECT {s.rejects.toLocaleString()}</span>
      <span className="tr-mint">● LIVE</span>
      <span className="tr-spacer" />
      <span className="tr-dim">VAULT $482,311.00</span>
    </div>
  );
}
