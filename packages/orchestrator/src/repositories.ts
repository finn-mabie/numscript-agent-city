import type Database from "better-sqlite3";
import type { AgentRecord, Relationship, IntentLogEntry, AgentId } from "./types.js";

// ── Agents ────────────────────────────────────────────────────────────────
export function agentRepo(db: Database.Database) {
  const upsertStmt = db.prepare(`
    INSERT INTO agents (id, name, role, tagline, color, next_tick_at, hustle_mode, created_at, updated_at)
    VALUES (@id, @name, @role, @tagline, @color, @nextTickAt, @hustleMode, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, role=excluded.role, tagline=excluded.tagline,
      color=excluded.color, next_tick_at=excluded.next_tick_at,
      hustle_mode=excluded.hustle_mode, updated_at=@now
  `);
  const get = db.prepare(`SELECT * FROM agents WHERE id = ?`);
  const list = db.prepare(`SELECT * FROM agents ORDER BY id`);
  const dueAt = db.prepare(`SELECT * FROM agents WHERE next_tick_at <= ? ORDER BY next_tick_at`);
  const updateTick = db.prepare(`UPDATE agents SET next_tick_at=?, updated_at=? WHERE id=?`);
  const setHustle = db.prepare(`UPDATE agents SET hustle_mode=?, updated_at=? WHERE id=?`);

  const row2rec = (r: any): AgentRecord => ({
    id: r.id, name: r.name, role: r.role, tagline: r.tagline, color: r.color,
    nextTickAt: r.next_tick_at, hustleMode: r.hustle_mode as 0 | 1,
    createdAt: r.created_at, updatedAt: r.updated_at
  });

  return {
    upsert(rec: Omit<AgentRecord, "createdAt" | "updatedAt">): void {
      upsertStmt.run({ ...rec, now: Date.now() });
    },
    get(id: AgentId): AgentRecord | null {
      const r = get.get(id);
      return r ? row2rec(r) : null;
    },
    list(): AgentRecord[] {
      return (list.all() as any[]).map(row2rec);
    },
    dueAt(now: number): AgentRecord[] {
      return (dueAt.all(now) as any[]).map(row2rec);
    },
    updateNextTick(id: AgentId, when: number): void {
      updateTick.run(when, Date.now(), id);
    },
    setHustle(id: AgentId, flag: 0 | 1): void {
      setHustle.run(flag, Date.now(), id);
    }
  };
}

// ── Relationships ─────────────────────────────────────────────────────────
export function relationshipsRepo(db: Database.Database) {
  const upsertStmt = db.prepare(`
    INSERT INTO relationships (agent_id, peer_id, trust, last_interaction_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(agent_id, peer_id) DO UPDATE SET trust=excluded.trust, last_interaction_at=excluded.last_interaction_at
  `);
  const top = db.prepare(
    `SELECT * FROM relationships WHERE agent_id = ? ORDER BY trust DESC, last_interaction_at DESC LIMIT ?`
  );
  const bottom = db.prepare(
    `SELECT * FROM relationships WHERE agent_id = ? ORDER BY trust ASC, last_interaction_at DESC LIMIT ?`
  );
  const row2rec = (r: any): Relationship => ({
    agentId: r.agent_id, peerId: r.peer_id, trust: r.trust, lastInteractionAt: r.last_interaction_at
  });

  return {
    upsert(rel: Relationship): void {
      upsertStmt.run(rel.agentId, rel.peerId, rel.trust, rel.lastInteractionAt);
    },
    top(agentId: AgentId, limit: number): Relationship[] {
      return (top.all(agentId, limit) as any[]).map(row2rec);
    },
    bottom(agentId: AgentId, limit: number): Relationship[] {
      return (bottom.all(agentId, limit) as any[]).map(row2rec);
    }
  };
}

// ── Intent log ────────────────────────────────────────────────────────────
export function intentLogRepo(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO intent_log (agent_id, tick_id, reasoning, template_id, params, outcome, error_phase, error_code, tx_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const recent = db.prepare(
    `SELECT * FROM intent_log WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`
  );
  const row2rec = (r: any): IntentLogEntry => ({
    id: r.id, agentId: r.agent_id, tickId: r.tick_id, reasoning: r.reasoning,
    templateId: r.template_id, params: r.params ? JSON.parse(r.params) : null,
    outcome: r.outcome, errorPhase: r.error_phase, errorCode: r.error_code,
    txId: r.tx_id, createdAt: r.created_at
  });

  return {
    insert(e: Omit<IntentLogEntry, "id">): void {
      insert.run(
        e.agentId, e.tickId, e.reasoning, e.templateId,
        e.params ? JSON.stringify(e.params) : null,
        e.outcome, e.errorPhase, e.errorCode, e.txId, e.createdAt
      );
    },
    recent(agentId: AgentId, limit: number): IntentLogEntry[] {
      return (recent.all(agentId, limit) as any[]).map(row2rec);
    }
  };
}

// ── Arena attacks ─────────────────────────────────────────────────────────
export interface ArenaAttackRecord {
  attackId: string;
  targetAgentId: string;
  promptHash: string;
  promptPreview: string;
  ipHash: string;
  submittedAt: number;
  status: "queued" | "running" | "committed" | "rejected" | "expired";
  tickId: string | null;
  outcomePhase: string | null;
  outcomeCode: string | null;
  resolvedAt: number | null;
}

export function arenaRepo(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO arena_attacks
      (attack_id, target_agent_id, prompt_hash, prompt_preview, ip_hash, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const get = db.prepare(`SELECT * FROM arena_attacks WHERE attack_id = ?`);
  const setStatus = db.prepare(`UPDATE arena_attacks SET status=? WHERE attack_id=?`);
  const recordOutcome = db.prepare(`
    UPDATE arena_attacks
    SET status=?, tick_id=?, outcome_phase=?, outcome_code=?, resolved_at=?
    WHERE attack_id=?
  `);

  const row2rec = (r: any): ArenaAttackRecord => ({
    attackId: r.attack_id,
    targetAgentId: r.target_agent_id,
    promptHash: r.prompt_hash,
    promptPreview: r.prompt_preview,
    ipHash: r.ip_hash,
    submittedAt: r.submitted_at,
    status: r.status,
    tickId: r.tick_id,
    outcomePhase: r.outcome_phase,
    outcomeCode: r.outcome_code,
    resolvedAt: r.resolved_at
  });

  return {
    insert(args: {
      attackId: string;
      targetAgentId: string;
      promptHash: string;
      promptPreview: string;
      ipHash: string;
      submittedAt: number;
    }): void {
      insert.run(
        args.attackId, args.targetAgentId, args.promptHash,
        args.promptPreview, args.ipHash, args.submittedAt
      );
    },
    get(attackId: string): ArenaAttackRecord | null {
      const r = get.get(attackId);
      return r ? row2rec(r) : null;
    },
    markRunning(attackId: string): void {
      setStatus.run("running", attackId);
    },
    recordOutcome(args: {
      attackId: string;
      tickId: string;
      status: "committed" | "rejected";
      outcomePhase: string | null;
      outcomeCode: string | null;
      resolvedAt: number;
    }): void {
      recordOutcome.run(
        args.status, args.tickId, args.outcomePhase, args.outcomeCode,
        args.resolvedAt, args.attackId
      );
    }
  };
}

// ── Offers ────────────────────────────────────────────────────────────────
export interface OfferRecord {
  id: string;
  authorAgentId: string;
  text: string;
  inReplyTo: string | null;
  createdAt: number;
  expiresAt: number;
  status: "open" | "closed" | "expired";
  closedByTx: string | null;
  closedByAgent: string | null;
  closedAt: number | null;
}

export function offerRepo(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO offers
      (id, author_agent_id, text, in_reply_to, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const get = db.prepare(`SELECT * FROM offers WHERE id = ?`);
  const openList = db.prepare(`
    SELECT * FROM offers
    WHERE status = 'open' AND author_agent_id != ? AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const openListAll = db.prepare(`
    SELECT * FROM offers
    WHERE status = 'open' AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const threadStmt = db.prepare(`
    SELECT * FROM offers
    WHERE id = ? OR in_reply_to = ?
    ORDER BY created_at ASC
  `);
  const closeStmt = db.prepare(`
    UPDATE offers
    SET status = 'closed', closed_by_tx = ?, closed_by_agent = ?, closed_at = ?
    WHERE id = ? AND status = 'open'
  `);
  const expireStmt = db.prepare(`
    UPDATE offers SET status = 'expired'
    WHERE status = 'open' AND expires_at < ?
  `);

  const row2rec = (r: any): OfferRecord => ({
    id: r.id,
    authorAgentId: r.author_agent_id,
    text: r.text,
    inReplyTo: r.in_reply_to,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    status: r.status,
    closedByTx: r.closed_by_tx,
    closedByAgent: r.closed_by_agent,
    closedAt: r.closed_at
  });

  return {
    insert(args: {
      id: string;
      authorAgentId: string;
      text: string;
      inReplyTo: string | null;
      createdAt: number;
      expiresAt: number;
    }): void {
      insert.run(args.id, args.authorAgentId, args.text, args.inReplyTo, args.createdAt, args.expiresAt);
    },
    get(id: string): OfferRecord | null {
      const r = get.get(id);
      return r ? row2rec(r) : null;
    },
    openOffers(limit: number, excludingAuthor?: string): OfferRecord[] {
      const now = Date.now();
      const rows = excludingAuthor
        ? (openList.all(excludingAuthor, now, limit) as any[])
        : (openListAll.all(now, limit) as any[]);
      return rows.map(row2rec);
    },
    threadOf(rootId: string): OfferRecord[] {
      return (threadStmt.all(rootId, rootId) as any[]).map(row2rec);
    },
    close(args: { id: string; closedByTx: string; closedByAgent: string; closedAt: number }): void {
      closeStmt.run(args.closedByTx, args.closedByAgent, args.closedAt, args.id);
    },
    expireOlderThan(now: number): number {
      const info = expireStmt.run(now);
      return info.changes;
    }
  };
}

// ── Direct Messages ──────────────────────────────────────────────────────
export interface DmRecord {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  text: string;
  inReplyTo: string | null;
  inReplyKind: "dm" | "offer" | null;
  createdAt: number;
  readAt: number | null;
  expiresAt: number;
}

export function dmRepo(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO dms
      (id, from_agent_id, to_agent_id, text, in_reply_to, in_reply_kind, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const get = db.prepare(`SELECT * FROM dms WHERE id = ?`);
  const unreadStmt = db.prepare(`
    SELECT * FROM dms
    WHERE to_agent_id = ? AND read_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const markReadStmt = db.prepare(`UPDATE dms SET read_at = ? WHERE id = ? AND read_at IS NULL`);
  const conversationStmt = db.prepare(`
    SELECT * FROM dms
    WHERE (from_agent_id = ? AND to_agent_id = ?)
       OR (from_agent_id = ? AND to_agent_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const recentBySender = db.prepare(`
    SELECT COUNT(*) AS c FROM dms
    WHERE from_agent_id = ? AND created_at >= ?
  `);
  const recentBySenderToRecipient = db.prepare(`
    SELECT COUNT(*) AS c FROM dms
    WHERE from_agent_id = ? AND to_agent_id = ? AND created_at >= ?
  `);
  const countExpired = db.prepare(`
    SELECT COUNT(*) AS c FROM dms
    WHERE expires_at < ? AND read_at IS NULL
  `);
  const involving = db.prepare(`
    SELECT * FROM dms
    WHERE from_agent_id = ? OR to_agent_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const row2rec = (r: any): DmRecord => ({
    id: r.id,
    fromAgentId: r.from_agent_id,
    toAgentId: r.to_agent_id,
    text: r.text,
    inReplyTo: r.in_reply_to,
    inReplyKind: r.in_reply_kind,
    createdAt: r.created_at,
    readAt: r.read_at,
    expiresAt: r.expires_at,
  });

  return {
    insert(args: {
      id: string;
      fromAgentId: string;
      toAgentId: string;
      text: string;
      inReplyTo: string | null;
      inReplyKind: "dm" | "offer" | null;
      createdAt: number;
      expiresAt: number;
    }): void {
      insert.run(
        args.id, args.fromAgentId, args.toAgentId, args.text,
        args.inReplyTo, args.inReplyKind, args.createdAt, args.expiresAt
      );
    },
    get(id: string): DmRecord | null {
      const r = get.get(id);
      return r ? row2rec(r) : null;
    },
    unreadFor(agentId: string, limit: number): DmRecord[] {
      const now = Date.now();
      return (unreadStmt.all(agentId, now, limit) as any[]).map(row2rec);
    },
    markRead(dmIds: string[], now: number): void {
      for (const id of dmIds) markReadStmt.run(now, id);
    },
    conversation(agentA: string, agentB: string, limit: number): DmRecord[] {
      return (conversationStmt.all(agentA, agentB, agentB, agentA, limit) as any[]).map(row2rec);
    },
    recentSentCount(fromAgentId: string, since: number, toAgentId?: string): number {
      if (toAgentId) {
        const r = recentBySenderToRecipient.get(fromAgentId, toAgentId, since) as { c: number };
        return r?.c ?? 0;
      }
      const r = recentBySender.get(fromAgentId, since) as { c: number };
      return r?.c ?? 0;
    },
    expireOlderThan(now: number): number {
      const r = countExpired.get(now) as { c: number };
      return r?.c ?? 0;
    },
    involvingAgent(agentId: string, limit: number): DmRecord[] {
      return (involving.all(agentId, agentId, limit) as any[]).map(row2rec);
    }
  };
}

// ── Price Signals ────────────────────────────────────────────────────────
export interface PriceSignalRecord {
  id: string;
  assetCode: string;
  targetPrice: number;
  setByIpHash: string;
  setAt: number;
  expiresAt: number;
  note: string | null;
}

export function priceSignalRepo(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO price_signals (id, asset_code, target_price, set_by_ip_hash, set_at, expires_at, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const get = db.prepare(`SELECT * FROM price_signals WHERE id = ?`);
  const active = db.prepare(`
    SELECT * FROM price_signals
    WHERE asset_code = ? AND expires_at > ?
    ORDER BY set_at DESC LIMIT 1
  `);
  const recentByIpStmt = db.prepare(`
    SELECT COUNT(*) AS c FROM price_signals
    WHERE set_by_ip_hash = ? AND set_at >= ?
  `);

  const row2rec = (r: any): PriceSignalRecord => ({
    id: r.id,
    assetCode: r.asset_code,
    targetPrice: r.target_price,
    setByIpHash: r.set_by_ip_hash,
    setAt: r.set_at,
    expiresAt: r.expires_at,
    note: r.note
  });

  return {
    insert(args: {
      id: string; assetCode: string; targetPrice: number;
      setByIpHash: string; setAt: number; expiresAt: number; note: string | null;
    }): void {
      insert.run(args.id, args.assetCode, args.targetPrice, args.setByIpHash, args.setAt, args.expiresAt, args.note);
    },
    get(id: string): PriceSignalRecord | null {
      const r = get.get(id);
      return r ? row2rec(r) : null;
    },
    activeFor(assetCode: string, now: number): PriceSignalRecord | null {
      const r = active.get(assetCode, now);
      return r ? row2rec(r) : null;
    },
    recentByIp(ipHash: string, since: number): number {
      const r = recentByIpStmt.get(ipHash, since) as { c: number };
      return r?.c ?? 0;
    }
  };
}
