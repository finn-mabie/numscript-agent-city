// Mirrors packages/orchestrator/src/types.ts#CityEvent but narrows data per kind.

export type AgentId = string;
export type TickId = string;

interface Base {
  agentId: AgentId;
  tickId: TickId;
  at: number;
}

export type CityEvent =
  | (Base & { kind: "tick-start" })
  | (Base & { kind: "intent";              data: { tool: string; input: Record<string, unknown>; reasoning: string; attackId?: string } })
  | (Base & { kind: "dry-run" })
  | (Base & { kind: "committed";           data: { templateId: string; txId: string; attackId?: string } })
  | (Base & { kind: "rejected";            data: { phase: RejectionPhase; code: string; message: string; attackId?: string } })
  | (Base & { kind: "idle";                data?: { attackId?: string } })
  | (Base & { kind: "hustle-enter" })
  | (Base & { kind: "hustle-exit" })
  | (Base & { kind: "relationship-update"; data: { peerId: AgentId; trust: number } })
  | (Base & { kind: "arena-submit";        data: { attackId: string; targetAgentId: AgentId; promptPreview: string; submittedAt: number } })
  | (Base & { kind: "arena-resolved";      data: { attackId: string; outcome: "committed" | "rejected" | "idle"; phase: RejectionPhase | null; code: string | null; tickId: string } });

export type RejectionPhase = "load" | "validate" | "render" | "dry-run" | "commit" | "authorization" | "scheduler";

// Narrowing helper for switch-exhaustiveness in consumers.
export function matchEvent<T>(e: CityEvent, handlers: {
  [K in CityEvent["kind"]]: (e: Extract<CityEvent, { kind: K }>) => T
}): T {
  // @ts-expect-error — TS can't prove the index is exhaustive without a large type dance
  return handlers[e.kind](e);
}
