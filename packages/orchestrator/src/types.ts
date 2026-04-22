import type { InvokeResult, ParamValue } from "@nac/template-engine";

export type AgentId = string; // "001" .. "010"

export interface AgentRecord {
  id: AgentId;
  name: string;
  role: string;
  tagline: string;
  color: string;             // hex (for later visualizations)
  nextTickAt: number;        // epoch ms
  hustleMode: 0 | 1;         // sqlite booleans are ints
  createdAt: number;
  updatedAt: number;
}

export interface Relationship {
  agentId: AgentId;
  peerId: AgentId;
  trust: number;             // -1..1
  lastInteractionAt: number; // epoch ms
}

export interface IntentLogEntry {
  id?: number;               // autoincrement
  agentId: AgentId;
  tickId: string;            // {agent_id}:{epoch_ms}
  reasoning: string;         // ≤ 280 chars
  templateId: string | null; // null if idle
  params: Record<string, ParamValue> | null;
  outcome: "committed" | "rejected" | "idle";
  errorPhase: string | null;
  errorCode: string | null;
  txId: string | null;
  createdAt: number;
}

export type CityEventKind =
  | "tick-start"
  | "intent"
  | "dry-run"
  | "committed"
  | "rejected"
  | "idle"
  | "hustle-enter"
  | "hustle-exit"
  | "relationship-update"
  | "arena-submit"
  | "arena-resolved"
  | "offer-posted"
  | "offer-closed"
  | "dm-sent";

export interface CityEvent {
  kind: CityEventKind;
  agentId: AgentId;
  tickId: string;
  at: number;
  data?: Record<string, unknown>;
}

export interface TickOutcome {
  tickId: string;
  agentId: AgentId;
  durationMs: number;
  result:
    | InvokeResult
    | { ok: true; idle: true }
    | { ok: true; postOffer: true; offerId: string }
    | { ok: true; sentDm: true; dmId: string };
}
