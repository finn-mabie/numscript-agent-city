"use client";
import { useEffect, useMemo, useRef } from "react";
import Phaser from "phaser";
import { createGlyphAdapter } from "./store-adapter";
import { GlyphScene } from "./scene";
import { CANVAS_W, CANVAS_H } from "./zones";
import IntentBoardRail from "./hud/IntentBoardRail";
import TickerRail from "./hud/TickerRail";
import TopRail from "./hud/TopRail";
import BottomRail from "./hud/BottomRail";
import { useCityStore } from "../state/city-store";

// Existing panels — mounted as overlays so click handlers on the canvas work.
// Wrapped in .legacy-panels so Glyph-token aliases apply (see shell.css).
import AgentPanel from "../components/AgentPanel";
import BuildingPanel from "../components/BuildingPanel";
import TxPanel from "../components/TxPanel";
import { ArenaBar } from "../components/ArenaBar";

const ORCH_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";
const WS_URL = process.env.NEXT_PUBLIC_CITY_WS ?? "ws://127.0.0.1:3070";

/**
 * Live Glyph City stage. Imported ONLY via next/dynamic with ssr:false so
 * Phaser's browser-only module doesn't get pulled into the server bundle.
 */
export default function GlyphStage() {
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const adapter = useMemo(() => createGlyphAdapter(), []);

  // Hydrate once on mount (same pattern as CityStage).
  useEffect(() => {
    fetch(`${ORCH_BASE}/snapshot`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => useCityStore.getState().hydrate({ agents: b.agents ?? [], recent: b.recent ?? [] }))
      .catch(() => { /* non-fatal */ });
    fetch(`${ORCH_BASE}/offers`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => useCityStore.getState().hydrateOffers(b.offers ?? []))
      .catch(() => { /* non-fatal */ });

    const ws = new WebSocket(WS_URL);
    ws.onmessage = (ev) => {
      try { useCityStore.getState().applyEvent(JSON.parse(ev.data)); } catch { /* ignore */ }
    };
    return () => { ws.close(); };
  }, []);

  // Mount Phaser once the wrap element exists.
  useEffect(() => {
    if (!canvasWrapRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: canvasWrapRef.current,
      width: CANVAS_W,
      height: CANVAS_H,
      transparent: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: [new GlyphScene(adapter)]
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
      adapter.destroy();
    };
  }, [adapter]);

  return (
    <div className="glyph-root shell">
      <TopRail adapter={adapter} />
      <div ref={canvasWrapRef} className="canvas-wrap" />
      <IntentBoardRail adapter={adapter} />
      <TickerRail adapter={adapter} />
      <BottomRail adapter={adapter} />

      {/* Overlay panels — positioned absolutely, escape the grid flow.
          Wrapped in .legacy-panels so the legacy CSS-var names (--ink,
          --paper, --dim, --mute, --gold, --scream, --hustle) alias to the
          Glyph palette; panels keep working without per-component restyle. */}
      <div className="legacy-panels">
        <AgentPanel />
        <BuildingPanel />
        <TxPanel />
        <ArenaBar />
      </div>
    </div>
  );
}
