# Agent Runtime — 10-agent autonomous economy with LLM ticks, state, and event stream

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an `@nac/orchestrator` package that runs 10 LLM-driven agents (including Judy the Red Agent) autonomously against the Formance ledger built in Plan 1. Each agent decides, on a tick, whether to invoke one of 13 Numscript templates, using hybrid memory (stateless context + persistent relationships + intent log). A WebSocket event stream broadcasts every intent, dry-run, commit, and rejection; a `watch-events` CLI pretty-prints the feed.

**Architecture:** The orchestrator is a single Node process. A tick scheduler wakes agents on a staggered interval. For each tick it builds context (ledger balance + relationships + recent events), calls Claude Sonnet 4.6 with the 13 templates as tools, validates the chosen `{template_id, params}` via the Plan 1 engine, commits via `invoke()`, updates the intent log and relationships, and emits events over WebSocket. Agent state (relationships, intent log, hustle flags, next_tick_at) persists in SQLite via `better-sqlite3`. No front-end — observability is the JSON event stream plus a dev-console CLI.

**Tech Stack:** Node 22 / TypeScript, `@nac/template-engine` (Plan 1), `@anthropic-ai/sdk` (tool-use), `better-sqlite3`, `ws`, Vitest. Targets either local Formance (via docker-compose from Plan 1) or a remote Formance Cloud stack via `LEDGER_URL` + OAuth2 config.

**Scope boundary:** No pixel city, no Phaser, no HTML UI, no arena, no webm capture, no OG images. Those are Plans 3 and 4. This plan stops at *"I run `pnpm city:start` and watch 10 agents transact autonomously against a real ledger via `pnpm city:watch`."*

---

## File structure (created by end of plan)

```
packages/orchestrator/
├── package.json
├── tsconfig.json
├── migrations/
│   └── 001_initial.sql              # agents, relationships, intent_log, schema_version
├── src/
│   ├── index.ts                     # public API (for future Plan 3 imports)
│   ├── types.ts                     # AgentId, AgentRecord, IntentLogEntry, CityEvent
│   ├── db.ts                        # better-sqlite3 init + migration runner
│   ├── repositories.ts              # agent, relationships, intent_log repos (sync API)
│   ├── roster.ts                    # 10 agents + Judy: id, name, role, tagline, color
│   ├── tool-schema.ts               # TemplateSchema → Anthropic tool definition
│   ├── context-builder.ts           # agent + ledger + relationships → LLM user message
│   ├── llm.ts                       # Anthropic client wrapper (structured tool use)
│   ├── hustle-mode.ts               # detects broke agents, decorates their prompt
│   ├── tick.ts                      # one-agent-one-turn: pure function-like orchestration
│   ├── events.ts                    # WebSocket broadcaster (JSON event → all clients)
│   └── scheduler.ts                 # drives ticks across the roster on a staggered timer
├── test/
│   ├── db.test.ts
│   ├── repositories.test.ts
│   ├── tool-schema.test.ts
│   ├── context-builder.test.ts
│   ├── hustle-mode.test.ts
│   ├── tick.test.ts                 # integration: real ledger, mocked LLM
│   └── scheduler.test.ts
└── cli/
    ├── run-agent-once.ts             # invoke one agent's next tick and exit (dev tool)
    ├── watch-events.ts               # WebSocket client that pretty-prints events to stdout
    └── run-city.ts                   # main entrypoint: boot DB, scheduler, WS server
```

**Responsibility split:**

- `db.ts` — SQLite connection + migration runner. No business logic.
- `repositories.ts` — synchronous CRUD. Each repo is a plain object of functions that take a `Database`.
- `roster.ts` — pure data: the 10+1 agent configs.
- `tool-schema.ts` — pure function: `TemplateSchema → AnthropicTool`. No I/O.
- `context-builder.ts` — pure-ish: takes agent record + ledger snapshot + relationships → string.
- `llm.ts` — thin wrapper around Anthropic SDK. Swappable for tests via dependency injection.
- `hustle-mode.ts` — pure predicate + prompt decorator. No I/O.
- `tick.ts` — composes context-builder → llm → invoke → repository updates → event emission.
- `events.ts` — WebSocket emitter. Owns the server and the client set.
- `scheduler.ts` — timer loop + concurrency control. Calls `tick()` per agent.

The whole package is a library + 3 CLI entrypoints. No singletons — every module's entry function takes its dependencies as args (DB, LedgerClient, LLM, EventBus). Makes every tick testable in isolation.

---

## Prerequisites

- Plan 1 is complete (13 templates, `@nac/template-engine` published to workspace, Formance ledger reachable via `LEDGER_URL`).
- `ANTHROPIC_API_KEY` set in `.env`.
- Genesis seed has run at least once on the target ledger (agent accounts + `unit_price` metadata + pool + treasury).

---

## Task 1: Orchestrator package scaffold + types

**Files:**
- Create: `packages/orchestrator/package.json`, `packages/orchestrator/tsconfig.json`, `packages/orchestrator/src/types.ts`

- [ ] **Step 1: Write `packages/orchestrator/package.json`**

```json
{
  "name": "@nac/orchestrator",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -p tsconfig.json --noEmit",
    "run-agent-once": "tsx cli/run-agent-once.ts",
    "watch-events": "tsx cli/watch-events.ts",
    "run-city": "tsx cli/run-city.ts"
  },
  "dependencies": {
    "@nac/template-engine": "workspace:*",
    "@anthropic-ai/sdk": "^0.30.1",
    "better-sqlite3": "^11.3.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.5.0",
    "@types/ws": "^8.5.12",
    "tsx": "^4.19.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/orchestrator/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": ".", "outDir": "dist" },
  "include": ["src/**/*", "cli/**/*"]
}
```

- [ ] **Step 3: Write `packages/orchestrator/src/types.ts`**

```ts
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
  | "relationship-update";

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
  result: InvokeResult | { ok: true; idle: true };
}
```

- [ ] **Step 4: Install and verify workspace pickup**

```bash
pnpm install
pnpm --filter @nac/orchestrator lint
```

Expected: workspace resolves 3 packages (root + template-engine + orchestrator); `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator/package.json packages/orchestrator/tsconfig.json packages/orchestrator/src/types.ts
git commit -m "feat(orchestrator): package scaffold + types"
```

---

## Task 2: SQLite migrations + `db.ts`

**Files:**
- Create: `packages/orchestrator/migrations/001_initial.sql`, `packages/orchestrator/src/db.ts`, `packages/orchestrator/test/db.test.ts`

- [ ] **Step 1: Write `packages/orchestrator/migrations/001_initial.sql`**

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,
  tagline         TEXT NOT NULL,
  color           TEXT NOT NULL,
  next_tick_at    INTEGER NOT NULL,
  hustle_mode     INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_next_tick_at ON agents(next_tick_at);

CREATE TABLE IF NOT EXISTS relationships (
  agent_id            TEXT NOT NULL,
  peer_id             TEXT NOT NULL,
  trust               REAL NOT NULL DEFAULT 0,
  last_interaction_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, peer_id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_trust ON relationships(agent_id, trust);

CREATE TABLE IF NOT EXISTS intent_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id        TEXT NOT NULL,
  tick_id         TEXT NOT NULL UNIQUE,
  reasoning       TEXT NOT NULL,
  template_id     TEXT,
  params          TEXT,        -- JSON-encoded
  outcome         TEXT NOT NULL,
  error_phase     TEXT,
  error_code      TEXT,
  tx_id           TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intent_log_agent ON intent_log(agent_id, created_at DESC);
```

- [ ] **Step 2: Write `packages/orchestrator/src/db.ts`**

```ts
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../migrations");

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`);
  const row = db.prepare(`SELECT MAX(version) AS v FROM schema_version`).get() as { v: number | null };
  const current = row.v ?? 0;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (version <= current) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN;\n" + sql + `\nINSERT INTO schema_version (version) VALUES (${version});\nCOMMIT;`);
  }
}
```

- [ ] **Step 3: Write failing test `packages/orchestrator/test/db.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

const dbPath = () => join(tmpdir(), `nac-orch-${Date.now()}-${Math.random()}.sqlite`);

describe("openDb", () => {
  it("creates the schema on first open", () => {
    const path = dbPath();
    const db = openDb(path);
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["agents", "relationships", "intent_log", "schema_version"])
    );
    db.close();
    rmSync(path);
  });

  it("is idempotent — re-opening runs no duplicate migrations", () => {
    const path = dbPath();
    openDb(path).close();
    openDb(path).close(); // would throw on "table already exists" if non-idempotent
    const db = openDb(path);
    const versions = db.prepare(`SELECT version FROM schema_version ORDER BY version`).all();
    expect(versions).toHaveLength(1);
    db.close();
    rmSync(path);
  });
});
```

- [ ] **Step 4: Run test — first run should FAIL with module-not-found; implement; run again; should PASS**

```bash
cd packages/orchestrator && pnpm test db
```

Expected: `Tests 2 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator/migrations packages/orchestrator/src/db.ts packages/orchestrator/test/db.test.ts
git commit -m "feat(orchestrator): sqlite init + migration runner"
```

---

## Task 3: Repositories (agent, relationships, intent_log)

**Files:**
- Create: `packages/orchestrator/src/repositories.ts`, `packages/orchestrator/test/repositories.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { agentRepo, relationshipsRepo, intentLogRepo } from "../src/repositories.js";

const path = () => join(tmpdir(), `nac-repo-${Date.now()}-${Math.random()}.sqlite`);

describe("repositories", () => {
  let db = openDb(path());
  beforeEach(() => { db = openDb(path()); });

  it("agents: upsert + list + updateNextTick + setHustle", () => {
    const a = agentRepo(db);
    a.upsert({ id: "001", name: "Alice", role: "Market-Maker", tagline: "x", color: "#ff0000", nextTickAt: 1000, hustleMode: 0 });
    expect(a.list().map((r) => r.id)).toEqual(["001"]);

    a.updateNextTick("001", 2000);
    expect(a.get("001")?.nextTickAt).toBe(2000);

    a.setHustle("001", 1);
    expect(a.get("001")?.hustleMode).toBe(1);

    a.upsert({ id: "002", name: "Bob", role: "Courier", tagline: "y", color: "#00ff00", nextTickAt: 500, hustleMode: 0 });
    expect(a.dueAt(1500).map((r) => r.id)).toEqual(["002"]); // only 002 is due at t=1500
  });

  it("relationships: upsert + getTop + decay math preserved by caller", () => {
    const r = relationshipsRepo(db);
    r.upsert({ agentId: "001", peerId: "002", trust: 0.4, lastInteractionAt: 100 });
    r.upsert({ agentId: "001", peerId: "003", trust: -0.2, lastInteractionAt: 200 });
    r.upsert({ agentId: "001", peerId: "004", trust: 0.9, lastInteractionAt: 300 });

    expect(r.top("001", 2).map((x) => x.peerId)).toEqual(["004", "001".length ? "002" : "002"]); // sanity
    expect(r.top("001", 2)[0].peerId).toBe("004");
    expect(r.bottom("001", 1)[0].peerId).toBe("003");

    // Idempotent overwrite of the same (agent, peer) pair
    r.upsert({ agentId: "001", peerId: "002", trust: 0.5, lastInteractionAt: 400 });
    expect(r.top("001", 3).find((x) => x.peerId === "002")?.trust).toBe(0.5);
  });

  it("intent_log: insert and recent by agent", () => {
    const l = intentLogRepo(db);
    l.insert({
      agentId: "001", tickId: "001:1000", reasoning: "test",
      templateId: "p2p_transfer", params: { memo: "hi" },
      outcome: "committed", errorPhase: null, errorCode: null, txId: "42", createdAt: 1000
    });
    l.insert({
      agentId: "001", tickId: "001:2000", reasoning: "idle",
      templateId: null, params: null,
      outcome: "idle", errorPhase: null, errorCode: null, txId: null, createdAt: 2000
    });
    const recent = l.recent("001", 5);
    expect(recent).toHaveLength(2);
    expect(recent[0].createdAt).toBe(2000); // newest first
    expect(recent[0].params).toBeNull();
    expect(recent[1].params).toEqual({ memo: "hi" });
  });
});
```

- [ ] **Step 2: Write `packages/orchestrator/src/repositories.ts`**

```ts
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
```

- [ ] **Step 3: Run tests — should pass**

```bash
pnpm test repositories
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/repositories.ts packages/orchestrator/test/repositories.test.ts
git commit -m "feat(orchestrator): sqlite repositories (agents, relationships, intent_log)"
```

---

## Task 4: Roster config — 10 agents + Judy

**Files:**
- Create: `packages/orchestrator/src/roster.ts`

- [ ] **Step 1: Write `packages/orchestrator/src/roster.ts`**

```ts
import type { AgentRecord } from "./types.js";

type RosterEntry = Pick<AgentRecord, "id" | "name" | "role" | "tagline" | "color">;

export const ROSTER: RosterEntry[] = [
  { id: "001", name: "Alice",   role: "Market-Maker", tagline: "Find small spreads, move volume, stay neutral.",                     color: "#6fa8dc" },
  { id: "002", name: "Bob",     role: "Courier",      tagline: "Pick up gigs, deliver quickly, build reputation.",                    color: "#e06666" },
  { id: "003", name: "Carol",   role: "Inspector",    tagline: "Rigorous. Fair. Your work is my work.",                                color: "#93c47d" },
  { id: "004", name: "Dave",    role: "Lender",       tagline: "Extend credit to trusted peers only.",                                 color: "#f6b26b" },
  { id: "005", name: "Eve",     role: "Researcher",   tagline: "Good answers, reasonable prices.",                                     color: "#c27ba0" },
  { id: "006", name: "Frank",   role: "Writer",       tagline: "Words when you need them, not before.",                                color: "#8e7cc3" },
  { id: "007", name: "Grace",   role: "Illustrator",  tagline: "Pairs well with Frank.",                                               color: "#76a5af" },
  { id: "008", name: "Heidi",   role: "Pool-Keeper",  tagline: "A pool for everyone, yield for patient money.",                        color: "#ffd966" },
  { id: "009", name: "Ivan",    role: "Disputant",    tagline: "Believe in rigor. Raise disputes when fair.",                          color: "#e69138" },
  { id: "010", name: "Judy",    role: "Red Agent",    tagline: "Probe the rules. Failure is the job.",                                 color: "#38761d" }
];

export const JUDY_ID = "010";

export function isJudy(id: string): boolean {
  return id === JUDY_ID;
}
```

- [ ] **Step 2: Commit (no test — pure data file)**

```bash
git add packages/orchestrator/src/roster.ts
git commit -m "feat(orchestrator): agent roster (10 agents + Judy)"
```

---

## Task 5: Tool-schema converter (`TemplateSchema` → Anthropic tool)

**Files:**
- Create: `packages/orchestrator/src/tool-schema.ts`, `packages/orchestrator/test/tool-schema.test.ts`

Anthropic tool-use accepts tool definitions in JSON Schema. Convert each of the 13 templates' `TemplateSchema` into an Anthropic `Tool`, plus one extra `idle` tool.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { toolsForTemplates, IDLE_TOOL } from "../src/tool-schema.js";
import type { Template } from "@nac/template-engine";

const demo: Template = {
  id: "p2p_transfer",
  source: "",
  readme: "",
  example: {},
  schema: {
    id: "p2p_transfer",
    description: "Direct payment.",
    params: {
      amount: { type: "monetary", asset: "USD/2", max: "1000_00" },
      to: { type: "account", pattern: "^@agents:[0-9]+:available$" },
      memo: { type: "string", maxLength: 140 }
    }
  }
};

describe("tool-schema", () => {
  it("generates one tool per template plus an idle tool", () => {
    const tools = toolsForTemplates([demo]);
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(["idle", "p2p_transfer"]);
  });

  it("maps monetary to an object with asset+amount", () => {
    const tools = toolsForTemplates([demo]);
    const p2p = tools.find((t) => t.name === "p2p_transfer")!;
    const amount = (p2p.input_schema.properties as any).amount;
    expect(amount.type).toBe("object");
    expect(amount.properties.asset.const).toBe("USD/2");
    expect(amount.properties.amount.maximum).toBe(100000); // 1000_00 → 100000
    expect(p2p.input_schema.required).toEqual(expect.arrayContaining(["amount", "to", "memo"]));
  });

  it("maps account/portion/string/number with appropriate json-schema constraints", () => {
    const tools = toolsForTemplates([demo]);
    const p2p = tools.find((t) => t.name === "p2p_transfer")!;
    const props = p2p.input_schema.properties as any;
    expect(props.to.type).toBe("string");
    expect(props.to.pattern).toBe("^@agents:[0-9]+:available$");
    expect(props.memo.type).toBe("string");
    expect(props.memo.maxLength).toBe(140);
  });

  it("idle tool has no params", () => {
    expect(IDLE_TOOL.name).toBe("idle");
    expect(IDLE_TOOL.input_schema.properties).toEqual({});
  });
});
```

- [ ] **Step 2: Write `packages/orchestrator/src/tool-schema.ts`**

```ts
import type { Template, TemplateSchema, ParamSpec } from "@nac/template-engine";

// Anthropic-compatible tool shape. Kept structural to avoid coupling to any specific SDK version.
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
  };
}

const parseMinor = (s: string): number => Number(s.replace(/_/g, ""));
const parsePortion = (s: string): number => {
  const t = s.trim();
  if (t.endsWith("%")) return Number(t.slice(0, -1)) / 100;
  const [n, d] = t.split("/");
  return d ? Number(n) / Number(d) : Number(t);
};

function paramJsonSchema(spec: ParamSpec): Record<string, unknown> {
  switch (spec.type) {
    case "monetary": {
      const amount: Record<string, unknown> = { type: "integer", minimum: 0 };
      if (spec.max !== undefined) amount.maximum = parseMinor(spec.max);
      if (spec.min !== undefined) amount.minimum = parseMinor(spec.min);
      const asset: Record<string, unknown> = { type: "string" };
      if (spec.asset) asset.const = spec.asset;
      return {
        type: "object",
        properties: { asset, amount },
        required: ["asset", "amount"],
        additionalProperties: false,
        description: spec.description
      };
    }
    case "account": {
      const s: Record<string, unknown> = { type: "string" };
      if (spec.const !== undefined) s.const = spec.const;
      if (spec.pattern !== undefined) s.pattern = spec.pattern;
      if (spec.description) s.description = spec.description;
      return s;
    }
    case "portion": {
      const s: Record<string, unknown> = {
        type: "string",
        pattern: "^(\\d+(\\.\\d+)?%|\\d+/\\d+)$"
      };
      if (spec.description) s.description = spec.description;
      // portion bounds are strings in the template schema; record them as JSON-schema `examples` hints.
      const hints: string[] = [];
      if (spec.min !== undefined) hints.push(`min ${spec.min}`);
      if (spec.max !== undefined) hints.push(`max ${spec.max}`);
      if (hints.length) s.description = `${s.description ?? ""} (${hints.join(", ")})`.trim();
      return s;
    }
    case "string": {
      const s: Record<string, unknown> = { type: "string" };
      if (spec.pattern) s.pattern = spec.pattern;
      if (spec.maxLength !== undefined) s.maxLength = spec.maxLength;
      if (spec.description) s.description = spec.description;
      return s;
    }
    case "number": {
      const s: Record<string, unknown> = { type: "number" };
      if (spec.minimum !== undefined) s.minimum = spec.minimum;
      if (spec.maximum !== undefined) s.maximum = spec.maximum;
      if (spec.description) s.description = spec.description;
      return s;
    }
  }
}

function toolFor(t: Template): AnthropicTool {
  const properties: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(t.schema.params)) {
    properties[name] = paramJsonSchema(spec);
  }
  return {
    name: t.schema.id,
    description: t.schema.description,
    input_schema: {
      type: "object",
      properties,
      required: Object.keys(t.schema.params),
      additionalProperties: false
    }
  };
}

export const IDLE_TOOL: AnthropicTool = {
  name: "idle",
  description: "Skip this tick. Use when no reasonable action is available.",
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }
};

export function toolsForTemplates(templates: Template[]): AnthropicTool[] {
  return [...templates.map(toolFor), IDLE_TOOL];
}
```

- [ ] **Step 3: Run tests and verify pass**

```bash
pnpm test tool-schema
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/tool-schema.ts packages/orchestrator/test/tool-schema.test.ts
git commit -m "feat(orchestrator): TemplateSchema → Anthropic tool converter"
```

---

## Task 6: Context builder

**Files:**
- Create: `packages/orchestrator/src/context-builder.ts`, `packages/orchestrator/test/context-builder.test.ts`

The context builder returns the **system prompt** + **user message** for the LLM, given agent state + ledger balance + roster + relationships + recent intents.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context-builder.js";
import type { AgentRecord, Relationship, IntentLogEntry } from "../src/types.js";

const agent: AgentRecord = {
  id: "001", name: "Alice", role: "Market-Maker",
  tagline: "Find small spreads, move volume, stay neutral.",
  color: "#0000ff", nextTickAt: 0, hustleMode: 0,
  createdAt: 0, updatedAt: 0
};
const peers: AgentRecord[] = [
  { ...agent, id: "002", name: "Bob", role: "Courier", tagline: "", color: "" },
  { ...agent, id: "003", name: "Carol", role: "Inspector", tagline: "", color: "" }
];
const balances: Record<string, number> = {
  "@agents:001:available": 10000, "@agents:002:available": 8000, "@agents:003:available": 500
};
const topRel: Relationship[] = [
  { agentId: "001", peerId: "002", trust: 0.6, lastInteractionAt: 0 }
];
const bottomRel: Relationship[] = [
  { agentId: "001", peerId: "003", trust: -0.4, lastInteractionAt: 0 }
];
const recent: IntentLogEntry[] = [
  { agentId: "001", tickId: "001:1", reasoning: "paid bob", templateId: "p2p_transfer", params: null, outcome: "committed", errorPhase: null, errorCode: null, txId: "42", createdAt: 1 }
];

describe("buildContext", () => {
  it("embeds identity, balance, roster, relationships, events", () => {
    const { system, user } = buildContext({ agent, peers, balances, topRel, bottomRel, recent });
    expect(system).toContain("Alice");
    expect(system).toContain("Market-Maker");
    expect(user).toContain("$100.00"); // 10000 minor units → $100.00
    expect(user).toContain("Bob");
    expect(user).toContain("Carol");
    expect(user).toContain("trust +0.60"); // top relationship
    expect(user).toContain("trust -0.40"); // bottom
    expect(user).toContain("paid bob");
    expect(user).toContain("p2p_transfer");
  });

  it("includes hustle-mode line when the agent is broke", () => {
    const broke = { ...agent, hustleMode: 1 as const };
    const { system } = buildContext({ agent: broke, peers, balances, topRel, bottomRel, recent });
    expect(system.toLowerCase()).toContain("nearly broke");
  });
});
```

- [ ] **Step 2: Write `packages/orchestrator/src/context-builder.ts`**

```ts
import type { AgentRecord, Relationship, IntentLogEntry } from "./types.js";

export interface ContextInput {
  agent: AgentRecord;
  peers: AgentRecord[];
  balances: Record<string, number>; // account address → USD/2 minor units
  topRel: Relationship[];
  bottomRel: Relationship[];
  recent: IntentLogEntry[];
}

export interface BuiltContext {
  system: string;
  user: string;
}

const fmtUsd = (minor: number): string =>
  (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const availableOf = (id: string): string => `@agents:${id}:available`;

function fmtPeerLine(a: AgentRecord, bal: number): string {
  return `- ${a.name} (${a.id}, ${a.role}) · ${fmtUsd(bal)}`;
}

function fmtRelLine(r: Relationship, peers: AgentRecord[]): string {
  const peer = peers.find((p) => p.id === r.peerId);
  const sign = r.trust >= 0 ? "+" : "";
  return `  · ${peer?.name ?? r.peerId} — trust ${sign}${r.trust.toFixed(2)}`;
}

function fmtEvent(e: IntentLogEntry): string {
  if (e.outcome === "idle") return `  · tick ${e.tickId}: idle`;
  if (e.outcome === "rejected") return `  · tick ${e.tickId}: ${e.templateId} rejected at ${e.errorPhase} (${e.errorCode})`;
  return `  · tick ${e.tickId}: ${e.templateId} ok — ${e.reasoning}`;
}

export function buildContext(input: ContextInput): BuiltContext {
  const { agent, peers, balances, topRel, bottomRel, recent } = input;
  const selfBalance = balances[availableOf(agent.id)] ?? 0;

  const peerLines = peers
    .filter((p) => p.id !== agent.id)
    .map((p) => fmtPeerLine(p, balances[availableOf(p.id)] ?? 0))
    .join("\n");

  const topLines = topRel.length ? topRel.map((r) => fmtRelLine(r, peers)).join("\n") : "  (none)";
  const bottomLines = bottomRel.length ? bottomRel.map((r) => fmtRelLine(r, peers)).join("\n") : "  (none)";
  const recentLines = recent.length ? recent.map(fmtEvent).join("\n") : "  (none)";

  const hustleLine = agent.hustleMode
    ? "You are nearly broke. Prioritize earning. Offer services at reduced fees if needed.\n"
    : "";

  const system = [
    `You are ${agent.name}, the ${agent.role}. ${agent.tagline}`,
    ``,
    hustleLine,
    `Rules:`,
    `- You may only invoke one of the provided tools — one of the 13 Numscript templates, or "idle".`,
    `- Every action is public and auditable.`,
    `- Money cannot be created; only earned, traded, or loaned.`,
    `- If no reasonable action is available, call the "idle" tool.`,
    `- Keep reasoning concise — max 280 characters in the tool's reasoning field if present.`
  ].filter(Boolean).join("\n");

  const user = [
    `Your current balance: ${fmtUsd(selfBalance)}`,
    ``,
    `Trusted peers:`,
    topLines,
    ``,
    `Distrusted peers:`,
    bottomLines,
    ``,
    `Other agents in the city:`,
    peerLines || "  (none)",
    ``,
    `Recent events involving you:`,
    recentLines,
    ``,
    `What's your next move?`
  ].join("\n");

  return { system, user };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test context-builder
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/context-builder.ts packages/orchestrator/test/context-builder.test.ts
git commit -m "feat(orchestrator): context builder (system + user prompts)"
```

---

## Task 7: Hustle mode

**Files:**
- Create: `packages/orchestrator/src/hustle-mode.ts`, `packages/orchestrator/test/hustle-mode.test.ts`

Pure predicate that decides whether an agent should toggle hustle mode based on recent balance and a flip-flop-resistant window.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { shouldEnterHustle, shouldExitHustle, HUSTLE_THRESHOLD_CENTS } from "../src/hustle-mode.js";

describe("hustle mode", () => {
  it("enters when balance has been ≤ threshold for consecutive ticks", () => {
    expect(shouldEnterHustle({ balanceNow: 50, lowTickCount: 3 })).toBe(true);    // ≤$0.50 + 3rd consecutive
    expect(shouldEnterHustle({ balanceNow: 50, lowTickCount: 2 })).toBe(false);
    expect(shouldEnterHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS, lowTickCount: 3 })).toBe(true);
    expect(shouldEnterHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS + 1, lowTickCount: 9 })).toBe(false);
  });

  it("exits when balance has recovered above 2× threshold", () => {
    expect(shouldExitHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS * 2 + 1 })).toBe(true);
    expect(shouldExitHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS * 2 })).toBe(false);
  });
});
```

- [ ] **Step 2: Write `packages/orchestrator/src/hustle-mode.ts`**

```ts
/**
 * Balance (in USD/2 minor units) at or below which an agent is considered broke.
 * $0.50 → 50 minor units. Chosen so small tx fees can't trivially push an agent into hustle mode.
 */
export const HUSTLE_THRESHOLD_CENTS = 50;

/**
 * Minimum number of consecutive low-balance ticks before entering hustle mode.
 * Prevents a momentary transfer-out from flipping the mode.
 */
export const HUSTLE_ENTRY_LOW_TICKS = 3;

export function shouldEnterHustle(s: { balanceNow: number; lowTickCount: number }): boolean {
  return s.balanceNow <= HUSTLE_THRESHOLD_CENTS && s.lowTickCount >= HUSTLE_ENTRY_LOW_TICKS;
}

export function shouldExitHustle(s: { balanceNow: number }): boolean {
  return s.balanceNow > HUSTLE_THRESHOLD_CENTS * 2;
}
```

- [ ] **Step 3: Run tests and verify pass**

```bash
pnpm test hustle-mode
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/hustle-mode.ts packages/orchestrator/test/hustle-mode.test.ts
git commit -m "feat(orchestrator): hustle-mode predicates"
```

---

## Task 8: LLM wrapper (Anthropic SDK with tool use)

**Files:**
- Create: `packages/orchestrator/src/llm.ts`

The LLM wrapper exposes a single method `pickAction(ctx, tools)` returning a normalized `{tool, input, reasoning}` triple. It hides SDK details so the tick can be tested with a mocked LLM.

- [ ] **Step 1: Write `packages/orchestrator/src/llm.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicTool } from "./tool-schema.js";

export interface Action {
  tool: string;                         // "idle" | template id
  input: Record<string, unknown>;       // empty for idle; typed params for a template
  reasoning: string;                    // model's brief explanation (≤ 280 chars)
}

export interface LLMClient {
  pickAction(ctx: { system: string; user: string }, tools: AnthropicTool[]): Promise<Action>;
}

export interface AnthropicLLMOptions {
  apiKey: string;
  model: string;                        // e.g. "claude-sonnet-4-6"
  maxTokens?: number;
}

export function anthropicLLM(opts: AnthropicLLMOptions): LLMClient {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const maxTokens = opts.maxTokens ?? 512;

  return {
    async pickAction({ system, user }, tools) {
      const res = await client.messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        system,
        tools: tools as any,           // SDK's Tool type lines up structurally with AnthropicTool
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: user }]
      });

      // Find the first tool_use block. With tool_choice:any there should be exactly one.
      const toolUse = res.content.find((b) => b.type === "tool_use") as any;
      if (!toolUse) {
        return { tool: "idle", input: {}, reasoning: "LLM did not select a tool; defaulting to idle." };
      }

      // Claude may preface the tool call with a text block containing reasoning.
      const textBlock = res.content.find((b) => b.type === "text") as any;
      const reasoning = textBlock?.text?.toString().slice(0, 280) ?? "";

      return {
        tool: String(toolUse.name),
        input: (toolUse.input ?? {}) as Record<string, unknown>,
        reasoning
      };
    }
  };
}
```

- [ ] **Step 2: No test for this wrapper — it's a thin SDK adapter and Task 9 (tick) exercises it via a mocked `LLMClient`.** Commit:

```bash
git add packages/orchestrator/src/llm.ts
git commit -m "feat(orchestrator): Anthropic SDK wrapper (pickAction)"
```

---

## Task 9: Tick executor (the heart of the orchestrator)

**Files:**
- Create: `packages/orchestrator/src/tick.ts`, `packages/orchestrator/test/tick.test.ts`

The tick executor runs one agent's turn: build context → call LLM → invoke template → update state → emit events.

- [ ] **Step 1: Write `packages/orchestrator/src/tick.ts`**

```ts
import { invoke, LedgerClient } from "@nac/template-engine";
import type { Template, ParamValue } from "@nac/template-engine";
import type Database from "better-sqlite3";
import { agentRepo, relationshipsRepo, intentLogRepo } from "./repositories.js";
import { buildContext } from "./context-builder.js";
import { toolsForTemplates } from "./tool-schema.js";
import { shouldEnterHustle, shouldExitHustle } from "./hustle-mode.js";
import type { AgentRecord, CityEvent, TickOutcome } from "./types.js";
import type { LLMClient } from "./llm.js";

export interface TickDeps {
  db: Database.Database;
  ledger: LedgerClient;
  llm: LLMClient;
  templates: Template[];
  templatesRoot: string;                 // for invoke()
  emit: (event: CityEvent) => void;
  now?: () => number;                    // for tests
  lowBalanceTickCount?: (agentId: string) => number; // injected counter, defaults to 0
}

const MIN_TICK_INTERVAL_MS = 7 * 60 * 1000;
const MAX_TICK_INTERVAL_MS = 13 * 60 * 1000;
const LOW_BALANCE_TRACKER = new Map<string, number>();

function nextTickAt(now: number): number {
  const span = MAX_TICK_INTERVAL_MS - MIN_TICK_INTERVAL_MS;
  return now + MIN_TICK_INTERVAL_MS + Math.floor(Math.random() * span);
}

function trustDelta(outcome: TickOutcome["result"], _templateId: string | null): number {
  // Cheap heuristic: successful gig/escrow interactions raise trust; disputes/refunds drop it.
  if ("idle" in outcome) return 0;
  if (!outcome.ok) return -0.10;
  const t = outcome.templateId;
  if (t === "gig_settlement" || t === "escrow_release" || t === "subscription_charge") return 0.10;
  if (t === "dispute_arbitration" || t === "refund" || t === "escrow_refund") return -0.10;
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

  // ── Ledger snapshot ─────────────────────────────────────────────────────
  const allIds = ag.list().map((r) => r.id);
  const balances: Record<string, number> = {};
  for (const id of allIds) {
    const addr = `agents:${id}:available`;
    const r = await fetch(`${(deps.ledger as any).baseUrl}/v2/${(deps.ledger as any).ledger}/accounts/${encodeURIComponent(addr)}?expand=volumes`);
    const body = await r.json().catch(() => ({})) as any;
    const data = body.data ?? body;
    balances[`@${addr}`] = Number(data?.volumes?.["USD/2"]?.balance ?? 0);
  }
  const selfBalance = balances[`@agents:${agent.id}:available`] ?? 0;

  // ── Hustle mode transition ──────────────────────────────────────────────
  const low = selfBalance <= 50
    ? (LOW_BALANCE_TRACKER.get(agent.id) ?? 0) + 1
    : 0;
  LOW_BALANCE_TRACKER.set(agent.id, low);
  const lowTickCount = low;

  if (!agent.hustleMode && shouldEnterHustle({ balanceNow: selfBalance, lowTickCount })) {
    ag.setHustle(agent.id, 1);
    agent = { ...agent, hustleMode: 1 };
    deps.emit({ kind: "hustle-enter", agentId: agent.id, tickId, at: Date.now() });
  } else if (agent.hustleMode && shouldExitHustle({ balanceNow: selfBalance })) {
    ag.setHustle(agent.id, 0);
    agent = { ...agent, hustleMode: 0 };
    deps.emit({ kind: "hustle-exit", agentId: agent.id, tickId, at: Date.now() });
  }

  // ── Build LLM context ───────────────────────────────────────────────────
  const peers = ag.list();
  const topRel = rels.top(agent.id, 5);
  const bottomRel = rels.bottom(agent.id, 3);
  const recent = log.recent(agent.id, 5);
  const { system, user } = buildContext({ agent, peers, balances, topRel, bottomRel, recent });

  deps.emit({ kind: "tick-start", agentId: agent.id, tickId, at: Date.now() });

  // ── LLM call ────────────────────────────────────────────────────────────
  const tools = toolsForTemplates(deps.templates);
  const action = await deps.llm.pickAction({ system, user }, tools);

  deps.emit({
    kind: "intent",
    agentId: agent.id, tickId, at: Date.now(),
    data: { tool: action.tool, input: action.input, reasoning: action.reasoning }
  });

  // ── Idle short-circuit ──────────────────────────────────────────────────
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

  // ── Invoke template ─────────────────────────────────────────────────────
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

  // ── Log + schedule + relationship update ────────────────────────────────
  log.insert({
    agentId: agent.id, tickId, reasoning: action.reasoning,
    templateId: action.tool, params,
    outcome: result.ok ? "committed" : "rejected",
    errorPhase: result.error?.phase ?? null,
    errorCode: result.error?.code ?? null,
    txId: result.committed?.id ?? null,
    createdAt: Date.now()
  });

  // Update trust with any counterparty we can identify from the params.
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
```

- [ ] **Step 2: Write the integration test using a mocked LLM and the real ledger**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { openDb } from "../src/db.js";
import { agentRepo } from "../src/repositories.js";
import { tickAgent } from "../src/tick.js";
import { ROSTER } from "../src/roster.js";
import { LedgerClient, loadTemplates } from "@nac/template-engine";
import type { LLMClient } from "../src/llm.js";
import type { CityEvent } from "../src/types.js";

const repoRoot = resolve(__dirname, "../../../");
const templatesRoot = resolve(repoRoot, "templates");
const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

beforeAll(async () => {
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
  execSync("pnpm seed-genesis", { cwd: repoRoot, stdio: "inherit" });
}, 60_000);

describe("tickAgent (integration)", () => {
  it("runs a p2p_transfer chosen by a mocked LLM and logs it", async () => {
    const path = join(tmpdir(), `tick-${Date.now()}.sqlite`);
    const db = openDb(path);
    const ag = agentRepo(db);
    for (const r of ROSTER) ag.upsert({ ...r, nextTickAt: 0, hustleMode: 0 });

    const events: CityEvent[] = [];
    const templates = await loadTemplates(templatesRoot);
    const client = new LedgerClient(url, ledger);

    const llm: LLMClient = {
      async pickAction() {
        return {
          tool: "p2p_transfer",
          reasoning: "send bob a dollar for the demo",
          input: {
            amount: { asset: "USD/2", amount: 100 },
            from: "@agents:001:available",
            to: "@agents:002:available",
            memo: "test tick"
          }
        };
      }
    };

    const agent = ag.get("001")!;
    const outcome = await tickAgent(agent, {
      db, ledger: client, llm, templates, templatesRoot,
      emit: (e) => events.push(e)
    });

    expect(outcome.result).toMatchObject({ ok: true });
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["tick-start", "intent", "committed", "relationship-update"])
    );
    const updatedAgent = ag.get("001")!;
    expect(updatedAgent.nextTickAt).toBeGreaterThan(Date.now());

    db.close();
    rmSync(path);
  });

  it("records idle and moves next_tick_at forward", async () => {
    const path = join(tmpdir(), `tick-${Date.now()}.sqlite`);
    const db = openDb(path);
    const ag = agentRepo(db);
    for (const r of ROSTER) ag.upsert({ ...r, nextTickAt: 0, hustleMode: 0 });

    const events: CityEvent[] = [];
    const templates = await loadTemplates(templatesRoot);
    const client = new LedgerClient(url, ledger);

    const llm: LLMClient = {
      async pickAction() { return { tool: "idle", input: {}, reasoning: "nothing to do" }; }
    };

    const agent = ag.get("001")!;
    const outcome = await tickAgent(agent, { db, ledger: client, llm, templates, templatesRoot, emit: (e) => events.push(e) });
    expect(outcome.result).toEqual({ ok: true, idle: true });
    expect(events.map((e) => e.kind)).toContain("idle");

    db.close();
    rmSync(path);
  });
});
```

- [ ] **Step 3: Ensure the ledger is up (Plan 1 state), then run**

```bash
pnpm ledger:up
cd packages/orchestrator && pnpm test tick
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/tick.ts packages/orchestrator/test/tick.test.ts
git commit -m "feat(orchestrator): single-agent tick executor (integration-tested)"
```

---

## Task 10: WebSocket event emitter

**Files:**
- Create: `packages/orchestrator/src/events.ts`, `packages/orchestrator/test/events.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { startEventBus } from "../src/events.js";

describe("event bus", () => {
  it("broadcasts events to connected clients as JSON lines", async () => {
    const bus = await startEventBus({ port: 0 }); // ephemeral port
    const url = `ws://127.0.0.1:${bus.port}`;
    const received: string[] = [];

    const ws = new WebSocket(url);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    ws.on("message", (data) => received.push(data.toString()));

    bus.emit({ kind: "idle", agentId: "001", tickId: "001:1", at: 123 });
    bus.emit({ kind: "committed", agentId: "002", tickId: "002:1", at: 124, data: { templateId: "p2p_transfer" } });

    // Give the socket time to flush
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(2);
    expect(JSON.parse(received[0]).kind).toBe("idle");
    expect(JSON.parse(received[1]).data.templateId).toBe("p2p_transfer");

    ws.close();
    await bus.close();
  });
});
```

- [ ] **Step 2: Write `packages/orchestrator/src/events.ts`**

```ts
import { WebSocketServer, WebSocket } from "ws";
import type { CityEvent } from "./types.js";

export interface EventBus {
  port: number;
  emit: (event: CityEvent) => void;
  close: () => Promise<void>;
}

export async function startEventBus(opts: { port: number }): Promise<EventBus> {
  const wss = new WebSocketServer({ port: opts.port });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const addr = wss.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;

  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  return {
    port,
    emit(event) {
      const line = JSON.stringify(event);
      for (const c of clients) {
        if (c.readyState === WebSocket.OPEN) c.send(line);
      }
    },
    close() {
      return new Promise((resolve) => {
        for (const c of clients) c.close();
        wss.close(() => resolve());
      });
    }
  };
}
```

- [ ] **Step 3: Run the test**

```bash
pnpm test events
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/events.ts packages/orchestrator/test/events.test.ts
git commit -m "feat(orchestrator): WebSocket event bus"
```

---

## Task 11: Scheduler

**Files:**
- Create: `packages/orchestrator/src/scheduler.ts`, `packages/orchestrator/test/scheduler.test.ts`

Drives ticks: every N seconds, query agents with `next_tick_at <= now`, run each serially, catch errors per-agent.

- [ ] **Step 1: Write failing test (uses a fake clock and a mocked tick function)**

```ts
import { describe, it, expect } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { agentRepo } from "../src/repositories.js";
import { startScheduler } from "../src/scheduler.js";
import { ROSTER } from "../src/roster.js";
import type { AgentRecord, TickOutcome } from "../src/types.js";

describe("scheduler", () => {
  it("wakes only due agents, serially, and continues on per-agent errors", async () => {
    const path = join(tmpdir(), `sched-${Date.now()}.sqlite`);
    const db = openDb(path);
    const ag = agentRepo(db);

    let now = 1000;
    for (const r of ROSTER) {
      ag.upsert({ ...r, nextTickAt: r.id === "001" ? 500 : 5000, hustleMode: 0 });
    }

    const ticked: string[] = [];
    const sched = startScheduler({
      db,
      now: () => now,
      intervalMs: 10,
      tickOne: async (agent: AgentRecord): Promise<TickOutcome> => {
        ticked.push(agent.id);
        if (agent.id === "001") throw new Error("boom");
        return { tickId: `${agent.id}:${now}`, agentId: agent.id, durationMs: 0, result: { ok: true, idle: true } };
      }
    });

    // Advance to a point where only "001" is due
    await new Promise((r) => setTimeout(r, 50));
    expect(ticked).toEqual(["001"]); // ran despite throwing

    now = 6000;
    await new Promise((r) => setTimeout(r, 50));
    expect(ticked.length).toBeGreaterThanOrEqual(2); // some others now due

    await sched.stop();
    db.close();
    rmSync(path);
  });
});
```

- [ ] **Step 2: Write `packages/orchestrator/src/scheduler.ts`**

```ts
import type Database from "better-sqlite3";
import { agentRepo } from "./repositories.js";
import type { AgentRecord, TickOutcome } from "./types.js";

export interface SchedulerOptions {
  db: Database.Database;
  intervalMs?: number;          // how often to poll the `due` queue (default 3s)
  now?: () => number;
  tickOne: (agent: AgentRecord) => Promise<TickOutcome>;
  onError?: (agentId: string, err: unknown) => void;
}

export interface SchedulerHandle {
  stop(): Promise<void>;
}

export function startScheduler(opts: SchedulerOptions): SchedulerHandle {
  const intervalMs = opts.intervalMs ?? 3000;
  const now = opts.now ?? Date.now;
  const ag = agentRepo(opts.db);
  let stopped = false;
  let running: Promise<void> = Promise.resolve();

  async function pump(): Promise<void> {
    if (stopped) return;
    const due = ag.dueAt(now());
    for (const agent of due) {
      if (stopped) return;
      try {
        await opts.tickOne(agent);
      } catch (e) {
        opts.onError?.(agent.id, e);
        // Still advance this agent's next_tick_at so a poison tick doesn't loop
        ag.updateNextTick(agent.id, now() + 60_000);
      }
    }
  }

  const timer = setInterval(() => {
    running = running.then(pump);
  }, intervalMs);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    }
  };
}
```

- [ ] **Step 3: Run test**

```bash
pnpm test scheduler
```

Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/scheduler.ts packages/orchestrator/test/scheduler.test.ts
git commit -m "feat(orchestrator): scheduler with per-agent error isolation"
```

---

## Task 12: Orchestrator public API barrel

**Files:**
- Create: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Write `packages/orchestrator/src/index.ts`**

```ts
export * from "./types.js";
export { openDb, runMigrations } from "./db.js";
export { agentRepo, relationshipsRepo, intentLogRepo } from "./repositories.js";
export { ROSTER, JUDY_ID, isJudy } from "./roster.js";
export { toolsForTemplates, IDLE_TOOL } from "./tool-schema.js";
export type { AnthropicTool } from "./tool-schema.js";
export { buildContext } from "./context-builder.js";
export type { ContextInput, BuiltContext } from "./context-builder.js";
export { shouldEnterHustle, shouldExitHustle, HUSTLE_THRESHOLD_CENTS, HUSTLE_ENTRY_LOW_TICKS } from "./hustle-mode.js";
export { anthropicLLM } from "./llm.js";
export type { LLMClient, Action, AnthropicLLMOptions } from "./llm.js";
export { tickAgent } from "./tick.js";
export type { TickDeps } from "./tick.js";
export { startScheduler } from "./scheduler.js";
export type { SchedulerOptions, SchedulerHandle } from "./scheduler.js";
export { startEventBus } from "./events.js";
export type { EventBus } from "./events.js";
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm --filter @nac/orchestrator lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/orchestrator/src/index.ts
git commit -m "feat(orchestrator): public API barrel"
```

---

## Task 13: CLI — `run-agent-once` (dev tool)

**Files:**
- Create: `packages/orchestrator/cli/run-agent-once.ts`

Runs one agent's next tick with a real LLM and the real ledger, then exits. Useful for verifying personality/behavior quickly without booting the full scheduler.

- [ ] **Step 1: Write `packages/orchestrator/cli/run-agent-once.ts`**

```ts
#!/usr/bin/env tsx
import { resolve } from "node:path";
import { LedgerClient, loadTemplates, clientCredentials } from "@nac/template-engine";
import {
  anthropicLLM, tickAgent, openDb, agentRepo, ROSTER
} from "../src/index.js";
import type { CityEvent } from "../src/index.js";

function resolveLedger(): LedgerClient {
  const baseUrl = process.env.LEDGER_URL ?? "http://localhost:3068";
  const ledger = process.env.LEDGER_NAME ?? "city";
  const hasOauth =
    process.env.OAUTH_TOKEN_ENDPOINT && process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET;
  return new LedgerClient(baseUrl, ledger, hasOauth
    ? {
        getAuthToken: clientCredentials({
          tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT!,
          clientId: process.env.OAUTH_CLIENT_ID!,
          clientSecret: process.env.OAUTH_CLIENT_SECRET!
        })
      }
    : {}
  );
}

async function main() {
  const [, , agentId = "001"] = process.argv;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY"); process.exit(2); }

  const repoRoot = resolve(process.cwd());
  const templatesRoot = resolve(repoRoot, "templates");
  const dbPath = process.env.NAC_DB ?? resolve(repoRoot, "data/orchestrator.sqlite");

  const db = openDb(dbPath);
  const ag = agentRepo(db);
  // Ensure roster exists
  for (const r of ROSTER) {
    if (!ag.get(r.id)) ag.upsert({ ...r, nextTickAt: 0, hustleMode: 0 });
  }

  const agent = ag.get(agentId);
  if (!agent) { console.error(`No such agent: ${agentId}`); process.exit(1); }

  const ledger = resolveLedger();
  const templates = await loadTemplates(templatesRoot);
  const llm = anthropicLLM({ apiKey, model: "claude-sonnet-4-6" });

  const emit = (e: CityEvent) => console.log(JSON.stringify(e));
  const outcome = await tickAgent(agent, { db, ledger, llm, templates, templatesRoot, emit });

  console.error(`\nOutcome: ${JSON.stringify(outcome.result)}  (duration ${outcome.durationMs}ms)`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Smoke test (requires `ANTHROPIC_API_KEY` and genesis seeded)**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pnpm --filter @nac/orchestrator build
pnpm --filter @nac/orchestrator run-agent-once 001
```

Expected: one `tick-start`, one `intent`, then either `committed`/`rejected`/`idle`, then the outcome summary. If the LLM picks a template it shouldn't (e.g. unknown id), the template-engine layer catches it and the event stream shows `rejected` with phase `load` or `validate` — the safety cage doing its job.

- [ ] **Step 3: Commit**

```bash
git add packages/orchestrator/cli/run-agent-once.ts
git commit -m "feat(orchestrator): run-agent-once CLI (single-tick dev tool)"
```

---

## Task 14: CLI — `watch-events` (dev console)

**Files:**
- Create: `packages/orchestrator/cli/watch-events.ts`

Connects to the WebSocket event bus and pretty-prints events with per-kind colors.

- [ ] **Step 1: Write `packages/orchestrator/cli/watch-events.ts`**

```ts
#!/usr/bin/env tsx
import WebSocket from "ws";
import type { CityEvent } from "../src/index.js";

const url = process.env.CITY_WS_URL ?? "ws://127.0.0.1:3070";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function ts(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function format(e: CityEvent): string {
  const head = `${dim(ts(e.at))} ${bold(e.agentId)}`;
  switch (e.kind) {
    case "tick-start": return `${head} ${dim("··· tick")}`;
    case "intent":     return `${head} ${cyan("→")} ${e.data?.tool} ${dim(JSON.stringify(e.data?.input).slice(0, 80))}`;
    case "dry-run":    return `${head} ${dim("dry-run ok")}`;
    case "committed":  return `${head} ${green("✓")} ${e.data?.templateId} ${dim(`tx ${e.data?.txId}`)}`;
    case "rejected":   return `${head} ${red("✗")} ${e.data?.code} ${dim(`(${e.data?.phase})`)} ${e.data?.message}`;
    case "idle":       return `${head} ${dim("idle")}`;
    case "hustle-enter": return `${head} ${yellow("♦ hustle mode on")}`;
    case "hustle-exit":  return `${head} ${yellow("♦ hustle mode off")}`;
    case "relationship-update": return `${head} ${dim(`rel ${e.data?.peerId} ↔ ${e.data?.trust}`)}`;
  }
}

const ws = new WebSocket(url);
ws.on("open", () => console.error(dim(`connected ${url}`)));
ws.on("message", (raw) => {
  try { console.log(format(JSON.parse(raw.toString()))); }
  catch { console.log(raw.toString()); }
});
ws.on("close", () => console.error(dim("closed")));
ws.on("error", (e) => { console.error("ws error:", e.message); process.exit(1); });
```

- [ ] **Step 2: Install `@types/ws` if not already pulled in**

(Already in the package.json devDependencies from Task 1.)

- [ ] **Step 3: Verify compile**

```bash
pnpm --filter @nac/orchestrator lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/cli/watch-events.ts
git commit -m "feat(orchestrator): watch-events CLI (pretty-print WS event stream)"
```

---

## Task 15: CLI — `run-city` (main entrypoint)

**Files:**
- Create: `packages/orchestrator/cli/run-city.ts`

Boots: DB + migrations → roster upsert (idempotent) → ledger client → event bus on port 3070 → scheduler → pump until SIGINT.

- [ ] **Step 1: Write `packages/orchestrator/cli/run-city.ts`**

```ts
#!/usr/bin/env tsx
import { resolve } from "node:path";
import { LedgerClient, loadTemplates, clientCredentials } from "@nac/template-engine";
import {
  openDb, agentRepo, ROSTER,
  anthropicLLM, tickAgent, startScheduler, startEventBus
} from "../src/index.js";
import type { CityEvent, TickOutcome } from "../src/index.js";

function resolveLedger(): LedgerClient {
  const baseUrl = process.env.LEDGER_URL ?? "http://localhost:3068";
  const ledger = process.env.LEDGER_NAME ?? "city";
  const hasOauth =
    process.env.OAUTH_TOKEN_ENDPOINT && process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET;
  return new LedgerClient(baseUrl, ledger, hasOauth
    ? {
        getAuthToken: clientCredentials({
          tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT!,
          clientId: process.env.OAUTH_CLIENT_ID!,
          clientSecret: process.env.OAUTH_CLIENT_SECRET!
        })
      }
    : {}
  );
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY"); process.exit(2); }

  const repoRoot = resolve(process.cwd());
  const templatesRoot = resolve(repoRoot, "templates");
  const dbPath = process.env.NAC_DB ?? resolve(repoRoot, "data/orchestrator.sqlite");
  const wsPort = Number(process.env.CITY_WS_PORT ?? 3070);

  const db = openDb(dbPath);
  const ag = agentRepo(db);
  // Idempotent roster seed: don't clobber an existing next_tick_at.
  for (const r of ROSTER) {
    const existing = ag.get(r.id);
    ag.upsert({
      ...r,
      nextTickAt: existing?.nextTickAt ?? 0,
      hustleMode: existing?.hustleMode ?? 0
    });
  }

  const ledger = resolveLedger();
  const templates = await loadTemplates(templatesRoot);
  const llm = anthropicLLM({ apiKey, model: "claude-sonnet-4-6" });
  const bus = await startEventBus({ port: wsPort });

  console.error(`[city] event bus ws://127.0.0.1:${bus.port}`);
  console.error(`[city] ledger    ${process.env.LEDGER_URL ?? "http://localhost:3068"}/v2/${process.env.LEDGER_NAME ?? "city"}`);
  console.error(`[city] db        ${dbPath}`);

  const emit = (e: CityEvent) => bus.emit(e);

  const sched = startScheduler({
    db,
    tickOne: (agent): Promise<TickOutcome> =>
      tickAgent(agent, { db, ledger, llm, templates, templatesRoot, emit }),
    onError: (id, err) => emit({
      kind: "rejected", agentId: id, tickId: `sched:${Date.now()}`, at: Date.now(),
      data: { phase: "scheduler", code: "TICK_FAILURE", message: (err as Error).message }
    })
  });

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error("\n[city] shutting down…");
    await sched.stop();
    await bus.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive
  await new Promise(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Root `package.json` convenience scripts**

Add to the root `package.json` scripts block (do not replace existing entries):

```json
    "city:start": "pnpm --filter @nac/orchestrator run-city",
    "city:watch": "pnpm --filter @nac/orchestrator watch-events",
    "city:tick": "pnpm --filter @nac/orchestrator run-agent-once"
```

- [ ] **Step 3: Smoke test**

In two terminals (both from repo root), with `ANTHROPIC_API_KEY` set and genesis seeded:

Terminal A:
```bash
pnpm city:start
```

Terminal B:
```bash
pnpm city:watch
```

Expected: within ~30 seconds, terminal B begins printing `tick-start` / `intent` / `committed` lines for one agent, then another. The ledger transactions appear under `set_tx_meta("type", ...)` filters in the ledger explorer.

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/cli/run-city.ts package.json
git commit -m "feat(orchestrator): run-city entrypoint + root city:* scripts"
```

---

## Task 16: `.env.example` additions for orchestrator

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append to `.env.example`**

```
# ── Orchestrator (Plan 2) ─────────────────────────────────────────
ANTHROPIC_API_KEY=
# Optional: path for the agent-state SQLite file (default: data/orchestrator.sqlite)
# NAC_DB=./data/orchestrator.sqlite
# WebSocket port for the event bus (default: 3070)
# CITY_WS_PORT=3070
# CITY_WS_URL=ws://127.0.0.1:3070   # used by watch-events CLI
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: .env.example — orchestrator configuration"
```

---

## Task 17: Integration smoke — 2-minute real run (manual)

This task is a human-verifiable sanity check, not an automated test.

**Goal:** boot the city, see agents transact autonomously for two minutes, confirm no crashes.

- [ ] **Step 1: Ensure prerequisites**

```bash
# 1. Build everything
pnpm --filter @nac/template-engine build
pnpm --filter @nac/orchestrator build

# 2. Ledger running + seeded
pnpm ledger:up
pnpm seed-genesis

# 3. Anthropic key exported
export ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Start the city in one terminal**

```bash
pnpm city:start
```

Expected: printout of ws/ledger/db paths; no errors.

- [ ] **Step 3: Start the watcher in another terminal**

```bash
pnpm city:watch
```

- [ ] **Step 4: Sit back for ~2 minutes**

Acceptance:
- At least 3 distinct `tick-start` events appear
- At least 1 `committed` event (a real tx id attached)
- Zero uncaught exceptions in terminal A
- Zero connection-closed messages in terminal B

If the ledger rejects attempts (e.g., an agent tries to send more than it has), you'll see `rejected` events — that's expected and healthy. The safety cage is working.

- [ ] **Step 5: Shut down**

Ctrl-C in terminal A. Expected: `[city] shutting down…` followed by a clean exit.

- [ ] **Step 6: Record evidence**

Paste the last ~20 lines from the watcher output into a comment on the commit or a release-notes doc. This is the human-visible proof Plan 2 ships.

---

## Task 18: README update + release gates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append a Plan 2 section to README.md** after the "Quick start" block:

```markdown
## Plan 2 — Agent Runtime (added this milestone)

Ten LLM-driven agents (including Judy, the Red Agent) now run autonomously against the Formance ledger. Each tick: context from the ledger + SQLite state → Claude Sonnet 4.6 (tool use over the 13 templates) → `invoke()` → events broadcast over WebSocket.

### Quick start

    export ANTHROPIC_API_KEY=sk-ant-...
    pnpm ledger:up                          # Plan 1 ledger
    pnpm seed-genesis                       # fund agents
    pnpm --filter @nac/orchestrator build
    pnpm city:start                         # terminal A: scheduler + WS
    pnpm city:watch                         # terminal B: pretty-printed event stream

### Single-agent tick (dev)

    pnpm city:tick 001

### Architecture

- `packages/orchestrator/` — scheduler, tick executor, context builder, LLM wrapper
- `data/orchestrator.sqlite` — agent state (relationships, intent log, hustle flags, next_tick_at)
- ws://127.0.0.1:3070 — JSON event stream (intent, committed, rejected, idle, relationship-update, hustle-enter/exit)

### Known issues carried from Plan 1

See the "Known issues (v1)" section above — the dry-run persistence and Postgres bind-mount caveats still apply. `invoke()` defaults to `mode: "commit"` in the orchestrator, so no double-commits.

### Not yet

No visuals — the pixel village and the arena land in Plans 3 and 4.
```

- [ ] **Step 2: Verify release gates**

Plan 2 is complete when all pass:

1. **Unit tests:** `pnpm --filter @nac/orchestrator test` — all pass.
2. **Full monorepo test:** `pnpm test` — nothing regresses in `@nac/template-engine`.
3. **One-tick CLI works:** `pnpm city:tick 001` emits a valid event sequence.
4. **City runs for 2 minutes** without crashes (Task 17).
5. **Event stream reachable externally:** `pnpm city:watch` connects and receives events.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — Plan 2 (agent runtime) overview + release gates"
```

---

## Release-gate recap (Plan 2)

1. All orchestrator unit tests pass (`db`, `repositories`, `tool-schema`, `context-builder`, `hustle-mode`, `tick`, `events`, `scheduler`).
2. Full monorepo test suite green.
3. `run-agent-once` completes a real LLM → real-ledger round trip.
4. `run-city` runs for 2 minutes with ≥ 3 tick-starts and ≥ 1 committed, zero crashes.
5. README Plan 2 section merged.

## Self-review (done)

- **Spec coverage:** § 3 Architecture (orchestrator + event stream), § 7.1-7.4 (tick mechanics + system prompt template + roster + hybrid memory), § 7.6 hustle mode, § 8 safety model (defense in depth at invoke/template-engine/ledger — reused from Plan 1), § 9 tech stack (Node 22, TS, Anthropic SDK, Postgres → substituted with SQLite for agent state; ledger still on Formance/Postgres), § 10 scope (no front-end, no arena — explicit boundary). § 3's "Agent Orchestrator" diagram block is fully implemented by Tasks 2-11.
- **Placeholder scan:** no "TBD", "TODO", "implement later". Every task has full code or exact commands.
- **Type consistency:** `AgentId` string, `AgentRecord.nextTickAt` (number), `CityEvent.kind` and `data` consistent across tick.ts, events.ts, watch-events.ts. `TickOutcome.result` is `InvokeResult | {ok: true; idle: true}` throughout. `toolsForTemplates(templates)` → `AnthropicTool[]` includes the `idle` tool; `LLMClient.pickAction` returns `{tool, input, reasoning}` — `tool === "idle"` branches in `tickAgent`.
- **Dependency order:** db → repositories → roster → tool-schema → context-builder → hustle-mode → llm → tick → events → scheduler → index → CLIs → integration → README. Each task is independently testable via the suite that came before it.

## Notes for Plan 3 (Visual City)

- The WebSocket on port 3070 is the sole integration surface. Plan 3's Next.js/Phaser front-end subscribes to it. No extra HTTP endpoints needed for the initial Plan 3.
- Agents' `color` field in the roster is there to drive sprite tint in Plan 3 — pre-authored per agent.
- `intent_log` reasoning strings are shown in the agent profile panel (Plan 3 spec § 6.1 "Click agent: profile panel + intent log").
- `relationship-update` events are currently emitted but unused by consumers; Plan 3 can surface them as subtle affinity indicators between agent sprites.

