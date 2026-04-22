// apps/web/src/glyph/store-adapter.ts
import { useCityStore } from "../state/city-store";
import { barrierKindFor } from "../phaser/barrier";

export type GlyphBarrierKind = "schema" | "overdraft" | "unknown" | "seen";

export interface GlyphIntentEvent {
  id: string;
  from: string;
  to: string;
  kind: "offer" | "reply";
  amount: number;
  summary: string;
  parent?: string;
  judy?: boolean;
}
export interface GlyphCommitEvent {
  id: string; from: string; to: string; amount: number; txid: string;
}
export interface GlyphRejectEvent {
  id: string; from: string; to: string; amount: number; txid: string;
  barrier: GlyphBarrierKind;
  detail: Record<string, string | number>;
}
export interface GlyphMoveEvent {
  id: string; fromZone: string; toZone: string; durationMs: number;
}
export interface GlyphTickEvent { tick: number; commits: number; rejects: number; }

type AnyGlyphEvent =
  | GlyphIntentEvent
  | GlyphCommitEvent
  | GlyphRejectEvent
  | GlyphMoveEvent
  | GlyphTickEvent;

type Listener = (payload: AnyGlyphEvent) => void;

export interface GlyphAdapter {
  on(ev: "intent" | "commit" | "reject" | "agent-move" | "tick", fn: Listener): void;
  off(ev: string, fn: Listener): void;
  /** Scene calls this every 500ms; no-op in live mode. */
  tick(): void;
  /** Call on unmount to remove the Zustand subscription. */
  destroy(): void;
}

export function createGlyphAdapter(): GlyphAdapter {
  const listeners: Record<string, Set<Listener>> = {};

  // Buffer events for each kind until at least one listener registers.
  // Phaser's scene.create() runs asynchronously after the React component
  // mounts, and React HUD components also hook listeners via useEffect —
  // both paths can miss the initial flood of events triggered by /snapshot
  // hydrate. Buffering ensures no event is lost to that race.
  const BUFFER_CAP = 200;
  const buffers: Record<string, AnyGlyphEvent[]> = {};

  const emit = (ev: string, p: AnyGlyphEvent) => {
    const ls = listeners[ev];
    if (ls && ls.size > 0) {
      ls.forEach((fn) => fn(p));
    } else {
      const buf = (buffers[ev] ||= []);
      buf.push(p);
      if (buf.length > BUFFER_CAP) buf.shift();
    }
  };

  // Track which entries we've already emitted for so reconnects / rebuilds
  // don't re-fire old events.
  const emittedTickIds = new Set<string>();
  const emittedOfferIds = new Set<string>();

  // Hydrate window: every subscriber fire in the first 800ms after mount is
  // treated as historical-snapshot noise (snapshot + /offers fetches resolve
  // during this window). We mark entries as "already emitted" so they don't
  // flood the canvas, but we do NOT emit them. After the window, everything
  // is a live event and emits normally.
  const HYDRATE_WINDOW_MS = 800;
  const seedingEndsAt = Date.now() + HYDRATE_WINDOW_MS;

  const unsub = useCityStore.subscribe((s, prev) => {
    const isHydrating = Date.now() < seedingEndsAt;
    if (isHydrating) {
      for (const r of s.recent) emittedTickIds.add(r.tickId);
      for (const id of Object.keys(s.offers)) emittedOfferIds.add(id);
      emit("tick", {
        tick: s.ticksToday,
        commits: s.committedToday,
        rejects: s.rejectedToday
      } as GlyphTickEvent);
      return;
    }

    // New recent entries → commit/reject
    for (const r of s.recent) {
      if (emittedTickIds.has(r.tickId)) continue;
      const prior = prev?.recent.find((p) => p.tickId === r.tickId);
      if (prior?.outcome === r.outcome && prior?.templateId === r.templateId) continue;

      const amount = amountFromParams(r.params);
      const peer = counterpartyFromParams(r.params, r.agentId) ?? r.agentId;
      const txid = r.txId ?? r.tickId.split(":")[1] ?? "0";

      if (r.outcome === "committed") {
        emittedTickIds.add(r.tickId);
        emit("commit", {
          id: r.tickId, from: r.agentId, to: peer, amount, txid
        } as GlyphCommitEvent);
        // NOTE: the scene handles the walk-to-counterparty choreography
        // itself inside onCommit (tween payer to payee, flash halos,
        // then return home). We no longer emit a separate agent-move
        // event here — it would race with the walk initiated in-scene.
      } else if (r.outcome === "rejected") {
        emittedTickIds.add(r.tickId);
        const barrier = mapBarrier(r.errorPhase, r.errorCode);
        emit("reject", {
          id: r.tickId, from: r.agentId, to: peer, amount, txid,
          barrier,
          detail: detailFor(barrier, r.errorCode ?? "", r.errorPhase ?? "", amount)
        } as GlyphRejectEvent);
      }
    }

    // New offers → intent events
    for (const o of Object.values(s.offers)) {
      if (emittedOfferIds.has(o.id)) continue;
      emittedOfferIds.add(o.id);
      emit("intent", {
        id: o.id,
        from: o.authorAgentId,
        to: o.inReplyTo ?? o.authorAgentId,
        kind: o.inReplyTo ? "reply" : "offer",
        amount: parseAmountFromText(o.text),
        summary: o.text.length > 60 ? o.text.slice(0, 57).trimEnd() + "…" : o.text,
        parent: o.inReplyTo ?? undefined,
        judy: o.authorAgentId === "010"
      } as GlyphIntentEvent);
    }

    // Per-change tick snapshot
    emit("tick", {
      tick: s.ticksToday,
      commits: s.committedToday,
      rejects: s.rejectedToday
    } as GlyphTickEvent);
  });

  return {
    on(ev, fn) {
      (listeners[ev] ||= new Set()).add(fn);
      // Flush any buffered events for this kind — catches the mount-race
      // where events arrive before the scene / HUD has subscribed.
      const pending = buffers[ev];
      if (pending && pending.length > 0) {
        buffers[ev] = [];
        for (const p of pending) fn(p);
      }
    },
    off(ev, fn) { listeners[ev]?.delete(fn); },
    tick() { /* no-op */ },
    destroy() { unsub(); }
  };
}

/**
 * Pull the first plausible dollar amount out of an offer's freeform text.
 * Offers don't have a structured price field, but agents routinely write
 * "for $8" or "pay $15" style phrases. Returns 0 if none found.
 */
function parseAmountFromText(text: string): number {
  // Match $N, $N.NN, $1,000 — first occurrence
  const m = text.match(/\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)/);
  if (!m) return 0;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function amountFromParams(params: unknown): number {
  if (!params || typeof params !== "object") return 0;
  const p = params as Record<string, unknown>;
  const amt = p.amount;
  if (amt && typeof amt === "object" && amt !== null && "amount" in amt) {
    const inner = (amt as { amount: unknown }).amount;
    return typeof inner === "number" ? inner / 100 : Number(inner) / 100;
  }
  if (typeof amt === "number") return amt / 100;
  return 0;
}

/**
 * Extract the COUNTERPARTY agent id from a tx's params, given the acting agent.
 * Previous impl grabbed the first @agents:NNN in property order, which is
 * almost always the acting agent themselves (e.g., subscription_charge params
 * list `subscriber` before `provider`). The corrected impl walks every
 * @agents:NNN reference and returns the first one that is NOT the actor.
 */
function counterpartyFromParams(params: unknown, actorId: string): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  for (const v of Object.values(params as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const m = v.match(/^@agents:([0-9]{3}):.+$/);
    if (m && m[1] && m[1] !== actorId) return m[1];
  }
  return undefined;
}

function mapBarrier(phase: string | null, code: string | null): GlyphBarrierKind {
  const k = barrierKindFor(phase, code);
  switch (k) {
    case "schema":           return "schema";
    case "overdraft":        return "overdraft";
    case "unknown-template": return "unknown";
    case "idempotency":      return "seen";
    case "authorization":    return "overdraft";
    default:                 return "overdraft";
  }
}

function detailFor(
  barrier: GlyphBarrierKind,
  code: string,
  phase: string,
  amount: number
): Record<string, string | number> {
  switch (barrier) {
    case "schema":
      return { field: "amount", want: "uint64", got: code || phase || "invalid" };
    case "overdraft":
      return {
        debit: amount.toFixed(2),
        avail: "0.00",
        short: amount.toFixed(2)
      };
    case "unknown":
      return { tmpl: code || "unknown_template", known: "posting, hold", hint: "register it" };
    case "seen":
      return { nonce: code || "replay", first: "prior tick", effect: "no-op" };
  }
}
