"use client";
import { useEffect, useRef, useState } from "react";
import { bootPhaser } from "../phaser/boot";
import { fetchSnapshot } from "../lib/snapshot";
import { connectEventStream } from "../lib/event-stream";
import { useCityStore } from "../state/city-store";
import type Phaser from "phaser";
import HudTopBar from "./HudTopBar";
import AgentCard from "./AgentCard";
import AgentPanel from "./AgentPanel";
import TxPanel from "./TxPanel";
import ActivityTicker from "./ActivityTicker";
import { ArenaBar } from "./ArenaBar";
import BuildingPanel from "./BuildingPanel";

type ConnStatus = "connecting" | "live" | "quiet" | "error";

export default function CityStage() {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [status, setStatus] = useState<ConnStatus>("connecting");

  useEffect(() => {
    if (!parentRef.current) return;
    gameRef.current = bootPhaser(parentRef.current);

    (async () => {
      try {
        const snap = await fetchSnapshot();
        useCityStore.getState().hydrate({
          agents: snap.agents.map((a) => ({ ...a, x: 0, y: 0 })),
          recent: snap.recent
        });
        setStatus(snap.recent.length > 0 ? "live" : "quiet");
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("snapshot unavailable", e);
        setStatus("error");
      }

      // Fetch offers in parallel (non-fatal if it fails)
      const ORCH_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";
      fetch(`${ORCH_BASE}/offers`, { cache: "no-store" })
        .then((r) => r.json())
        .then((b) => useCityStore.getState().hydrateOffers(b.offers ?? []))
        .catch(() => { /* non-fatal */ });
    })();

    const stream = connectEventStream((e) => {
      useCityStore.getState().applyEvent(e);
      setStatus("live");
    });

    return () => {
      stream.close();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-ink">
      <div ref={parentRef} className="flex min-h-screen items-center justify-center" />
      <HudTopBar />
      <AgentCard />
      <AgentPanel />
      <TxPanel />
      <BuildingPanel />
      <ActivityTicker />
      <ArenaBar />
      {status === "connecting" && (
        <Overlay>Connecting to the city…</Overlay>
      )}
      {status === "error" && (
        <Overlay>Snapshot unavailable. Is <code className="text-scream">pnpm city:start</code> running?</Overlay>
      )}
      {status === "quiet" && (
        <Overlay subtle>Waiting for the first agent tick…</Overlay>
      )}
    </div>
  );
}

function Overlay({ children, subtle }: { children: React.ReactNode; subtle?: boolean }) {
  return (
    <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[11px] px-3 py-1.5 ${subtle ? "text-dim bg-transparent" : "text-paper bg-ink border border-mute"}`}>
      {children}
    </div>
  );
}
