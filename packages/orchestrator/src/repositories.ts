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
