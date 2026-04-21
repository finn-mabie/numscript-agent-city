import { invoke, LedgerClient } from "@nac/template-engine";
import type { Template, ParamValue } from "@nac/template-engine";
import type Database from "better-sqlite3";
import { agentRepo, relationshipsRepo, intentLogRepo } from "./repositories.js";
import type { offerRepo as offerRepoFactory } from "./repositories.js";
import { buildContext } from "./context-builder.js";
import { toolsForTemplates } from "./tool-schema.js";
import { shouldEnterHustle, shouldExitHustle, HUSTLE_THRESHOLD_CENTS } from "./hustle-mode.js";
import { assertSelfOwned } from "./auth.js";
import type { AgentRecord, CityEvent, TickOutcome } from "./types.js";
import type { LLMClient } from "./llm.js";
import type { ArenaQueue, QueuedAttack } from "./arena.js";
import type { arenaRepo } from "./repositories.js";
import { validateOfferText, newOfferId, OFFER_ID_RE } from "./offers.js";
import { AGENT_TEMPLATE_MAP } from "./agent-templates-map.js";
type ArenaRepo = ReturnType<typeof arenaRepo>;
type OfferRepoT = ReturnType<typeof offerRepoFactory>;

export interface TickDeps {
  db: Database.Database;
  ledger: LedgerClient;
  llm: LLMClient;
  templates: Template[];
  templatesRoot: string;
  emit: (event: CityEvent) => void;
  now?: () => number;
  /** Optional — when set, each tick drains one queued arena prompt for the agent. */
  arenaQueue?: ArenaQueue;
  /** Optional — when set, arena attack outcomes are persisted here. */
  arenaRepo?: ArenaRepo;
  /** Board state: when set, board context flows into buildContext and post_offer actions persist here. */
  offerRepo?: OfferRepoT;
  /** Called on every valid post_offer. run-city advances up to 3 peers from templateOverlapPeers. */
  advancePeersOnOffer?: (args: { authorAgentId: string; offerId: string; templateOverlapPeers: string[] }) => void;
}

// Tick intervals are env-configurable so demo/visual-testing can shorten
// them without touching production defaults. Values are milliseconds.
// Tick cadence. Demo is the default so the city feels alive on first boot —
// set SLOW_TICKS=1 for the original 7-13 min "realistic" pacing when you want
// the demo to mirror production rhythm. TICK_MIN_MS / TICK_MAX_MS still win
// when set explicitly.
const SLOW = process.env.SLOW_TICKS === "1";
const MIN_TICK_INTERVAL_MS = Number(process.env.TICK_MIN_MS ?? (SLOW ? 7 * 60 * 1000  : 20_000));
const MAX_TICK_INTERVAL_MS = Number(process.env.TICK_MAX_MS ?? (SLOW ? 13 * 60 * 1000 : 40_000));
const LOW_BALANCE_TRACKER = new Map<string, number>();
const OFFER_TTL_MS = 5 * 60_000;

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

// Issue 3: private helper — collapses the 3 near-identical record+emit blocks.
function recordAndEmitArenaResolved(args: {
  queued: QueuedAttack | null;
  tickId: string;
  agentId: string;
  arenaRepo: ArenaRepo | undefined;
  emit: (e: CityEvent) => void;
  outcome: "committed" | "rejected" | "idle";
  status: "committed" | "rejected";
  phase: string | null;
  code: string | null;
}): void {
  if (!args.queued || !args.arenaRepo) return;
  args.arenaRepo.recordOutcome({
    attackId: args.queued.attackId,
    tickId: args.tickId,
    status: args.status,
    outcomePhase: args.phase,
    outcomeCode: args.code,
    resolvedAt: Date.now()
  });
  args.emit({
    kind: "arena-resolved",
    agentId: args.agentId,
    tickId: args.tickId,
    at: Date.now(),
    data: {
      attackId: args.queued.attackId,
      outcome: args.outcome,
      phase: args.phase,
      code: args.code,
      tickId: args.tickId
    }
  });
}

export async function tickAgent(
  agent: AgentRecord,
  deps: TickDeps
): Promise<TickOutcome> {
  const now = (deps.now ?? Date.now)();
  const tickId = `${agent.id}:${now}`;
  const started = Date.now();

  // Arena injection — if any prompt is queued for this agent, drain one.
  // The visitor text never touches ledger, DB, or scheduler directly; it
  // becomes a string field inside the user message to Anthropic only.
  const queued = deps.arenaQueue?.drain(agent.id) ?? null;
  if (queued && deps.arenaRepo) {
    deps.arenaRepo.markRunning(queued.attackId);
  }

  // Issue 1: wrap post-drain body in try/catch so a thrown exception never
  // leaves the arena_attacks row stuck at "running".
  try {
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
    const board = deps.offerRepo?.openOffers(8, agent.id) ?? [];
    const { system, user } = buildContext({
      agent, peers: allAgents, balances, topRel, bottomRel, recent,
      arenaInjection: queued?.prompt,
      board
    });

    deps.emit({ kind: "tick-start", agentId: agent.id, tickId, at: Date.now(),
      ...(queued ? { data: { attackId: queued.attackId } } : {}) });

    // LLM call
    const tools = toolsForTemplates(deps.templates);
    const action = await deps.llm.pickAction({ system, user }, tools);

    deps.emit({
      kind: "intent",
      agentId: agent.id, tickId, at: Date.now(),
      data: { tool: action.tool, input: action.input, reasoning: action.reasoning,
              ...(queued ? { attackId: queued.attackId } : {}) }
    });

    // ── post_offer branch (Intent Board) ────────────────────────────────
    if (action.tool === "post_offer") {
      const rawText = String((action.input as any)?.text ?? "");
      const rawReply = (action.input as any)?.in_reply_to;
      const text = validateOfferText(rawText);
      if (!text || !deps.offerRepo) {
        // Invalid text or no board wired → treat as idle
        log.insert({
          agentId: agent.id, tickId, reasoning: action.reasoning,
          templateId: "post_offer", params: action.input as Record<string, ParamValue>,
          outcome: "idle",
          errorPhase: text ? null : "validate",
          errorCode: text ? null : "InvalidOfferText",
          txId: null, createdAt: Date.now()
        });
        ag.updateNextTick(agent.id, nextTickAt(Date.now()));
        deps.emit({ kind: "idle", agentId: agent.id, tickId, at: Date.now() });
        recordAndEmitArenaResolved({
          queued, tickId, agentId: agent.id,
          arenaRepo: deps.arenaRepo, emit: deps.emit,
          outcome: "idle", status: "rejected",
          phase: null, code: "IDLE"
        });
        return { tickId, agentId: agent.id, durationMs: Date.now() - started, result: { ok: true, idle: true } };
      }

      // Validate in_reply_to if present
      let inReplyTo: string | null = null;
      if (typeof rawReply === "string" && OFFER_ID_RE.test(rawReply)) {
        const parent = deps.offerRepo.get(rawReply);
        if (parent && parent.status === "open") inReplyTo = rawReply;
      }

      const offerId = newOfferId();
      const createdAt = Date.now();
      const expiresAt = createdAt + OFFER_TTL_MS;
      deps.offerRepo.insert({
        id: offerId, authorAgentId: agent.id, text,
        inReplyTo, createdAt, expiresAt
      });

      log.insert({
        agentId: agent.id, tickId, reasoning: action.reasoning,
        templateId: "post_offer",
        params: { text, in_reply_to: inReplyTo, offer_id: offerId } as Record<string, ParamValue>,
        outcome: "committed",
        errorPhase: null, errorCode: null, txId: null, createdAt
      });

      deps.emit({
        kind: "offer-posted", agentId: agent.id, tickId, at: createdAt,
        data: { offerId, authorAgentId: agent.id, text, inReplyTo, expiresAt }
      });

      // Ask run-city to wake relevant peers (template overlap computed here)
      if (deps.advancePeersOnOffer) {
        const mine = AGENT_TEMPLATE_MAP[agent.id] ?? [];
        const peers = allAgents
          .filter((p) => p.id !== agent.id)
          .filter((p) => (AGENT_TEMPLATE_MAP[p.id] ?? []).some((t) => mine.includes(t)))
          .map((p) => p.id);
        deps.advancePeersOnOffer({ authorAgentId: agent.id, offerId, templateOverlapPeers: peers });
      }

      ag.updateNextTick(agent.id, nextTickAt(Date.now()));
      // A visitor-queued prompt that resolved into a post_offer is still a cage
      // "win" — no financial damage was done. Close the arena record as idle-ish
      // (the attack produced only a board post, not a ledger move).
      recordAndEmitArenaResolved({
        queued, tickId, agentId: agent.id,
        arenaRepo: deps.arenaRepo, emit: deps.emit,
        outcome: "idle", status: "rejected",
        phase: null, code: "POST_OFFER"
      });
      return { tickId, agentId: agent.id, durationMs: Date.now() - started, result: { ok: true, postOffer: true, offerId } };
    }

    // Idle short-circuit
    if (action.tool === "idle") {
      log.insert({
        agentId: agent.id, tickId, reasoning: action.reasoning,
        templateId: null, params: null, outcome: "idle",
        errorPhase: null, errorCode: null, txId: null, createdAt: Date.now()
      });
      ag.updateNextTick(agent.id, nextTickAt(Date.now()));
      deps.emit({ kind: "idle", agentId: agent.id, tickId, at: Date.now(),
        ...(queued ? { data: { attackId: queued.attackId } } : {}) });
      recordAndEmitArenaResolved({
        queued, tickId, agentId: agent.id,
        arenaRepo: deps.arenaRepo, emit: deps.emit,
        outcome: "idle", status: "rejected",
        phase: null, code: "IDLE"
      });
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
        data: { phase: "authorization", code: "NotSelfOwned", message: msg,
                ...(queued ? { attackId: queued.attackId } : {}) }
      });
      recordAndEmitArenaResolved({
        queued, tickId, agentId: agent.id,
        arenaRepo: deps.arenaRepo, emit: deps.emit,
        outcome: "rejected", status: "rejected",
        phase: "authorization", code: "NotSelfOwned"
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
      deps.emit({ kind: "committed", agentId: agent.id, tickId, at: Date.now(),
        data: { templateId: action.tool, txId: result.committed?.id,
                ...(queued ? { attackId: queued.attackId } : {}) } });
    } else {
      deps.emit({ kind: "rejected", agentId: agent.id, tickId, at: Date.now(),
        data: { phase: result.error?.phase, code: result.error?.code, message: result.error?.message,
                ...(queued ? { attackId: queued.attackId } : {}) } });
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

    const finalPhase = result.ok ? null : (result.error?.phase ?? "commit");
    const finalCode  = result.ok ? null : (result.error?.code  ?? "UNKNOWN");
    const finalStatus: "committed" | "rejected" = result.ok ? "committed" : "rejected";
    recordAndEmitArenaResolved({
      queued, tickId, agentId: agent.id,
      arenaRepo: deps.arenaRepo, emit: deps.emit,
      outcome: finalStatus, status: finalStatus,
      phase: finalPhase, code: finalCode
    });

    // Close any open offer referenced in the committed tx's memo.
    if (deps.offerRepo && result.ok && result.committed?.id) {
      const memo = typeof (params as any).memo === "string" ? (params as any).memo : "";
      const m = memo.match(/\boff_[a-z0-9]+_[a-f0-9]{4}\b/);
      if (m) {
        const offerIdInMemo = m[0];
        const offer = deps.offerRepo.get(offerIdInMemo);
        if (offer && offer.status === "open" && offer.authorAgentId !== agent.id) {
          const closedAt = Date.now();
          deps.offerRepo.close({
            id: offerIdInMemo,
            closedByTx: result.committed.id,
            closedByAgent: agent.id,
            closedAt
          });
          deps.emit({
            kind: "offer-closed", agentId: agent.id, tickId, at: closedAt,
            data: {
              offerId: offerIdInMemo,
              closedByTx: result.committed.id,
              closedByAgent: agent.id,
              closedAt
            }
          });
        }
      }
    }

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
  } catch (err) {
    // Issue 1: record the exception so the arena_attacks row doesn't stay
    // stuck at "running", then re-throw so the scheduler's error path fires.
    recordAndEmitArenaResolved({
      queued, tickId, agentId: agent.id,
      arenaRepo: deps.arenaRepo, emit: deps.emit,
      outcome: "rejected", status: "rejected",
      phase: "exception", code: "THROWN"
    });
    throw err;
  }
}
