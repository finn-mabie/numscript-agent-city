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
  console.log("[glyph-stage] render");
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const didInitRef = useRef(false);
  const adapter = useMemo(() => createGlyphAdapter(), []);

  // Hydrate once on mount.
  // NOTE on the delayed WS open: React 18 StrictMode in dev mounts every
  // effect twice — mount → cleanup → mount again. If we open the WebSocket
  // synchronously, the cleanup runs before the handshake completes and the
  // browser logs "WebSocket is closed before the connection is established."
  // The short setTimeout skips past the phantom cycle: on the real mount we
  // open, on real unmount we close.
  useEffect(() => {
    fetch(`${ORCH_BASE}/snapshot`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => useCityStore.getState().hydrate({ agents: b.agents ?? [], recent: b.recent ?? [] }))
      .catch(() => { /* non-fatal */ });
    fetch(`${ORCH_BASE}/offers`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => useCityStore.getState().hydrateOffers(b.offers ?? []))
      .catch(() => { /* non-fatal */ });

    let ws: WebSocket | null = null;
    let cancelled = false;
    const openTimer = setTimeout(() => {
      if (cancelled) return;
      ws = new WebSocket(WS_URL);
      ws.onopen = () => console.log("[glyph] WS open");
      ws.onclose = () => console.log("[glyph] WS close");
      ws.onerror = (e) => console.log("[glyph] WS error", e);
      ws.onmessage = (ev) => {
        try { useCityStore.getState().applyEvent(JSON.parse(ev.data)); } catch { /* ignore */ }
      };
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(openTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, []);

  // Mount Phaser. React 18 StrictMode double-mounts every effect in dev;
  // Phaser does NOT survive a destroy+recreate cycle cleanly within one
  // frame, so we gate with didInitRef: once initialized we stay
  // initialized for the component's lifetime. On real unmount (navigate
  // away) the component fully re-mounts and the ref resets.
  useEffect(() => {
    console.log("[glyph-stage] phaser effect run", { hasWrap: !!canvasWrapRef.current, alreadyInit: didInitRef.current });
    if (!canvasWrapRef.current) return;
    if (didInitRef.current) return;
    didInitRef.current = true;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: canvasWrapRef.current,
      width: CANVAS_W,
      height: CANVAS_H,
      transparent: true,
      render: { antialias: true, pixelArt: false, roundPixels: false, antialiasGL: true },
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: [new GlyphScene(adapter)]
    });
    gameRef.current = game;
    console.log("[glyph-stage] Phaser.Game constructed");
    // NOTE: no cleanup — StrictMode's phantom cleanup would destroy
    // Phaser before scene.create() even runs. Leaking a Phaser game on
    // real remount is a dev-only cost we tolerate.
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
