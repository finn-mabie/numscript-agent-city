import { invoke, LedgerClient } from "@nac/template-engine";
import type { Template, ParamValue } from "@nac/template-engine";
import type Database from "better-sqlite3";
import { agentRepo, relationshipsRepo, intentLogRepo } from "./repositories.js";
import { buildContext } from "./context-builder.js";
import { toolsForTemplates } from "./tool-schema.js";
import { shouldEnterHustle, shouldExitHustle, HUSTLE_THRESHOLD_CENTS } from "./hustle-mode.js";
import { assertSelfOwned } from "./auth.js";
import type { AgentRecord, CityEvent, TickOutcome } from "./types.js";
import type { LLMClient } from "./llm.js";

export interface TickDeps {
  db: Database.Database;
  ledger: LedgerClient;
  llm: LLMClient;
  templates: Template[];
  templatesRoot: string;
  emit: (event: CityEvent) => void;
  now?: () => number;
}

const MIN_TICK_INTERVAL_MS = 7 * 60 * 1000;
const MAX_TICK_INTERVAL_MS = 13 * 60 * 1000;
const LOW_BALANCE_TRACKER = new Map<string, number>();

function nextTickAt(now: number): number {
  const span = MAX_TICK_INTERVAL_MS - MIN_TICK_INTERVAL_MS;
  return now + MIN_TICK_INTERVAL_MS + Math.floor(Math.random() * span);
}

function trustDelta(outcome: TickOutcome["result"], templateId: string | null): number {
  if ("idle" in outcome) return 0;
  if (!outcome.ok) return -0.10;
  if (templateId === "gig_settlement" || templateId === "escrow_release" || templateId === "subscription_charge") return 0.10;
  if (templateId === "dispute_arbitration" || templateId === "refund" || templateId === "escrow_refund") return -0.10;
  return 0.05;
}

export async function tickAgent(
  agent: AgentRecord,
  deps: TickDeps
): Promise<TickOutcome> {
  const now = (deps.now ?? Date.now)();
  const tickId = `${agent.id}:${now}`;
  const started = Date.now();

  const ag = agentRepo(deps.db);
  const rels = relationshipsRepo(deps.db);
  const log = intentLogRepo(deps.db);

  // Ledger snapshot
  const allAgents = ag.list();
  const balances: Record<string, number> = {};
  for (const peer of allAgents) {
    const addr = `@agents:${peer.id}:available`;
    const bal = await deps.ledger.getBalance(addr, "USD/2");
    balances[addr] = bal ?? 0;
  }
  const selfBalance = balances[`@agents:${agent.id}:available`] ?? 0;

  // Hustle mode transition
  const low = selfBalance <= HUSTLE_THRESHOLD_CENTS
    ? (LOW_BALANCE_TRACKER.get(agent.id) ?? 0) + 1
    : 0;
  LOW_BALANCE_TRACKER.set(agent.id, low);

  if (!agent.hustleMode && shouldEnterHustle({ balanceNow: selfBalance, lowTickCount: low })) {
    ag.setHustle(agent.id, 1);
    agent = { ...agent, hustleMode: 1 };
    deps.emit({ kind: "hustle-enter", agentId: agent.id, tickId, at: Date.now() });
  } else if (agent.hustleMode && shouldExitHustle({ balanceNow: selfBalance })) {
    ag.setHustle(agent.id, 0);
    agent = { ...agent, hustleMode: 0 };
    deps.emit({ kind: "hustle-exit", agentId: agent.id, tickId, at: Date.now() });
  }

  // Build LLM context
  const topRel = rels.top(agent.id, 5);
  const bottomRel = rels.bottom(agent.id, 3);
  const recent = log.recent(agent.id, 5);
  const { system, user } = buildContext({ agent, peers: allAgents, balances, topRel, bottomRel, recent });

  deps.emit({ kind: "tick-start", agentId: agent.id, tickId, at: Date.now() });

  // LLM call
  const tools = toolsForTemplates(deps.templates);
  const action = await deps.llm.pickAction({ system, user }, tools);

  deps.emit({
    kind: "intent",
    agentId: agent.id, tickId, at: Date.now(),
    data: { tool: action.tool, input: action.input, reasoning: action.reasoning }
  });

  // Idle short-circuit
  if (action.tool === "idle") {
    log.insert({
      agentId: agent.id, tickId, reasoning: action.reasoning,
      templateId: null, params: null, outcome: "idle",
      errorPhase: null, errorCode: null, txId: null, createdAt: Date.now()
    });
    ag.updateNextTick(agent.id, nextTickAt(Date.now()));
    deps.emit({ kind: "idle", agentId: agent.id, tickId, at: Date.now() });
    return { tickId, agentId: agent.id, durationMs: Date.now() - started, result: { ok: true, idle: true } };
  }

  // Authorization guard (fourth safety layer) — runs BEFORE invoke()
  const authCheck = assertSelfOwned(action.tool, action.input, agent.id);
  if (!authCheck.ok) {
    const msg = `${action.tool}.${authCheck.paramName} = "${authCheck.got}" is not owned by agent ${agent.id}`;
    log.insert({
      agentId: agent.id, tickId, reasoning: action.reasoning,
      templateId: action.tool, params: action.input as Record<string, ParamValue>,
      outcome: "rejected",
      errorPhase: "authorization",
      errorCode: "NotSelfOwned",
      txId: null,
      createdAt: Date.now()
    });
    ag.updateNextTick(agent.id, nextTickAt(Date.now()));
    deps.emit({
      kind: "rejected", agentId: agent.id, tickId, at: Date.now(),
      data: { phase: "authorization", code: "NotSelfOwned", message: msg }
    });
    return {
      tickId, agentId: agent.id, durationMs: Date.now() - started,
      result: {
        ok: false,
        templateId: action.tool,
        params: action.input as Record<string, ParamValue>,
        renderedNumscript: "",
        error: {
          phase: "authorization",
          code: "NotSelfOwned",
          message: msg
        }
      }
    };
  }

  // Invoke template
  const params = action.input as Record<string, ParamValue>;
  const result = await invoke({
    rootDir: deps.templatesRoot,
    templateId: action.tool,
    params,
    reference: `tick:${tickId}`,
    client: deps.ledger,
    mode: "commit"
  });

  if (result.ok) {
    deps.emit({ kind: "committed", agentId: agent.id, tickId, at: Date.now(), data: { templateId: action.tool, txId: result.committed?.id } });
  } else {
    deps.emit({ kind: "rejected", agentId: agent.id, tickId, at: Date.now(), data: { phase: result.error?.phase, code: result.error?.code, message: result.error?.message } });
  }

  log.insert({
    agentId: agent.id, tickId, reasoning: action.reasoning,
    templateId: action.tool, params,
    outcome: result.ok ? "committed" : "rejected",
    errorPhase: result.error?.phase ?? null,
    errorCode: result.error?.code ?? null,
    txId: result.committed?.id ?? null,
    createdAt: Date.now()
  });

  // Relationship updates (identifying counterparties by agent-id prefix in param values)
  for (const value of Object.values(params)) {
    if (typeof value !== "string" || !value.startsWith("@agents:")) continue;
    const peerId = value.split(":")[1];
    if (!peerId || peerId === agent.id) continue;
    const existing = rels.top(agent.id, 1000).find((r) => r.peerId === peerId);
    const prior = existing?.trust ?? 0;
    const next = Math.max(-1, Math.min(1, prior + trustDelta(result, action.tool)));
    rels.upsert({ agentId: agent.id, peerId, trust: next, lastInteractionAt: Date.now() });
    deps.emit({ kind: "relationship-update", agentId: agent.id, tickId, at: Date.now(), data: { peerId, trust: next } });
  }

  ag.updateNextTick(agent.id, nextTickAt(Date.now()));

  return { tickId, agentId: agent.id, durationMs: Date.now() - started, result };
}
