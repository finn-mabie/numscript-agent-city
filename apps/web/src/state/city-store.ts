"use client";
import { create } from "zustand";
import type { CityEvent } from "../lib/event-schema";

export interface AgentView {
  id: string;
  name: string;
  role: string;
  tagline: string;
  color: string;
  balance: number;        // USD/2 minor units
  hustleMode: 0 | 1;
  x: number;              // tile coord; assigned at snapshot time
  y: number;
}

export interface IntentLogView {
  agentId: string;
  tickId: string;
  reasoning: string;
  templateId: string | null;
  params: Record<string, unknown> | null;
  outcome: "committed" | "rejected" | "idle";
  errorPhase: string | null;
  errorCode: string | null;
  txId: string | null;
  createdAt: number;
}

interface CityState {
  agents: Record<string, AgentView>;
  recent: IntentLogView[];      // newest first, capped
  ticksToday: number;
  committedToday: number;
  rejectedToday: number;
  bootedAt: number;             // epoch ms

  hydrate: (args: { agents: AgentView[]; recent: IntentLogView[] }) => void;
  applyEvent: (e: CityEvent) => void;
}

const RECENT_CAP = 200;

// A deterministic 4×3 tile layout for the 10 agents, anchored in open ground.
// Plan 3's tile grid is a 20×12 space; agents start here and wander via random walk.
const START_POSITIONS: Record<string, [number, number]> = {
  "001": [ 3, 3], "002": [ 5, 3], "003": [ 7, 3], "004": [ 9, 3], "005": [11, 3],
  "006": [ 3, 5], "007": [ 5, 5], "008": [ 7, 5], "009": [ 9, 5], "010": [11, 5]
};

export const useCityStore = create<CityState>((set) => ({
  agents: {},
  recent: [],
  ticksToday: 0,
  committedToday: 0,
  rejectedToday: 0,
  bootedAt: Date.now(),

  hydrate({ agents, recent }) {
    const byId: Record<string, AgentView> = {};
    for (const a of agents) {
      const [x, y] = START_POSITIONS[a.id] ?? [0, 0];
      byId[a.id] = { ...a, x, y };
    }
    set({ agents: byId, recent: recent.slice(0, RECENT_CAP) });
  },

  applyEvent(e) {
    set((s) => {
      const next: Partial<CityState> = {};

      if (e.kind === "tick-start") next.ticksToday = s.ticksToday + 1;
      if (e.kind === "committed") next.committedToday = s.committedToday + 1;
      if (e.kind === "rejected") next.rejectedToday = s.rejectedToday + 1;

      if (e.kind === "hustle-enter" && s.agents[e.agentId]) {
        next.agents = { ...s.agents, [e.agentId]: { ...s.agents[e.agentId], hustleMode: 1 } };
      }
      if (e.kind === "hustle-exit" && s.agents[e.agentId]) {
        next.agents = { ...s.agents, [e.agentId]: { ...s.agents[e.agentId], hustleMode: 0 } };
      }

      // Intent / committed / rejected / idle all get logged
      if (e.kind === "intent" || e.kind === "committed" || e.kind === "rejected" || e.kind === "idle") {
        const entry: IntentLogView = {
          agentId: e.agentId,
          tickId: e.tickId,
          reasoning: e.kind === "intent" ? (e as any).data?.reasoning ?? "" : "",
          templateId: e.kind === "intent" ? (e as any).data?.tool ?? null
                    : e.kind === "committed" ? (e as any).data?.templateId ?? null
                    : null,
          params: e.kind === "intent" ? (e as any).data?.input ?? null : null,
          outcome: e.kind === "committed" ? "committed"
                 : e.kind === "rejected" ? "rejected"
                 : e.kind === "idle" ? "idle"
                 : "committed", // intent alone isn't an outcome; a later committed/rejected replaces it
          errorPhase: e.kind === "rejected" ? (e as any).data?.phase ?? null : null,
          errorCode:  e.kind === "rejected" ? (e as any).data?.code  ?? null : null,
          txId:       e.kind === "committed" ? (e as any).data?.txId ?? null : null,
          createdAt: e.at
        };
        next.recent = [entry, ...s.recent].slice(0, RECENT_CAP);
      }

      return next;
    });
  }
}));
