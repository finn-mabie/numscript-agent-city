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
  /** "pending" = intent emitted, awaiting commit/reject. Replaced on terminal outcome. */
  outcome: "pending" | "committed" | "rejected" | "idle";
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

// Each agent has a "home" tile next to the building they naturally operate from.
// The random-walk in agent-sprite.ts biases ~30% of steps toward home, so agents
// cluster around their post but still wander through the village. Buildings live
// at y=1 (top row) and y=9 (bottom row); agent homes sit one tile below / above
// the corresponding building. Freelance agents (Eve/Frank/Grace/Judy) anchor in
// the middle row.
// Anchored owners stand BESIDE their building (one tile offset so the agent
// sprite doesn't occlude the artwork). Buildings are at ty=2 (top row) and
// ty=10 (bottom row); owners sit at ty=4 and ty=8 respectively. Freelancers
// live in the middle of the grid.
const START_POSITIONS: Record<string, [number, number]> = {
  "001": [ 2, 4],   // Alice — Market         (below Market)
  "002": [12, 4],   // Bob — Post Office      (below Post Office)
  "003": [18, 4],   // Carol — Inspector      (below Inspector)
  "004": [ 7, 4],   // Dave — Bank            (below Bank)
  "005": [ 4, 6],   // Eve — freelance (research)
  "006": [ 9, 6],   // Frank — freelance (writing)
  "007": [14, 6],   // Grace — freelance (illustration)
  "008": [ 5, 8],   // Heidi — Pool           (above Pool)
  "009": [14, 8],   // Ivan — Escrow          (above Escrow Vault)
  "010": [18, 6]    // Judy — Red Agent probe zone
};

/**
 * Agents whose job is to "man" a specific building — they stay at their
 * post instead of wandering. Only freelancers + Judy (005/006/007/010) walk.
 */
export const ANCHORED_IDS = new Set(["001", "002", "003", "004", "008", "009"]);

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

      // Intent / committed / rejected / idle all get logged. When a commit or
      // reject arrives with a tickId that already has a pending intent entry,
      // we REPLACE rather than prepend — so the recent log shows one entry
      // per tx, going pending → terminal as events stream in.
      if (e.kind === "intent" || e.kind === "committed" || e.kind === "rejected" || e.kind === "idle") {
        const existing = s.recent.find((x) => x.tickId === e.tickId);
        const entry: IntentLogView = {
          agentId: e.agentId,
          tickId: e.tickId,
          reasoning: e.kind === "intent" ? (e as any).data?.reasoning ?? "" : (existing?.reasoning ?? ""),
          templateId: e.kind === "intent"    ? (e as any).data?.tool ?? null
                    : e.kind === "committed" ? (e as any).data?.templateId ?? existing?.templateId ?? null
                    : existing?.templateId ?? null,
          params:     e.kind === "intent" ? (e as any).data?.input ?? null : (existing?.params ?? null),
          outcome:    e.kind === "committed" ? "committed"
                    : e.kind === "rejected"  ? "rejected"
                    : e.kind === "idle"      ? "idle"
                    : "pending",  // intent
          errorPhase: e.kind === "rejected" ? (e as any).data?.phase ?? null : null,
          errorCode:  e.kind === "rejected" ? (e as any).data?.code  ?? null : null,
          txId:       e.kind === "committed" ? (e as any).data?.txId ?? null : null,
          createdAt:  existing?.createdAt ?? e.at
        };
        // Remove any existing entry with this tickId, then prepend the fresh one.
        const without = s.recent.filter((x) => x.tickId !== e.tickId);
        next.recent = [entry, ...without].slice(0, RECENT_CAP);
      }

      return next;
    });
  }
}));
