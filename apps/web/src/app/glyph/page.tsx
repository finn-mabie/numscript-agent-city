"use client";
import "./glyph-tokens.css";
import "./shell.css";
import { useEffect, useMemo, useRef } from "react";
import Phaser from "phaser";
import { createGlyphAdapter } from "../../glyph/store-adapter";
import { GlyphScene } from "../../glyph/scene";
import { CANVAS_W, CANVAS_H } from "../../glyph/zones";
import IntentBoardRail from "../../glyph/hud/IntentBoardRail";
import TickerRail from "../../glyph/hud/TickerRail";
import TopRail from "../../glyph/hud/TopRail";
import BottomRail from "../../glyph/hud/BottomRail";
import { useCityStore } from "../../state/city-store";

const ORCH_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";
const WS_URL = process.env.NEXT_PUBLIC_CITY_WS ?? "ws://127.0.0.1:3070";

export default function GlyphPage() {
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
    </div>
  );
}
