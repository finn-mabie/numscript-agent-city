import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, agentRepo } from "../src/index.js";
import { startHttp } from "../src/http.js";
import { dmRepo } from "../src/repositories.js";

describe("dms HTTP", () => {
  let db: Database.Database;
  let handle: Awaited<ReturnType<typeof startHttp>>;
  let repo: ReturnType<typeof dmRepo>;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    agentRepo(db).upsert({ id: "001", name: "Alice", role: "r", tagline: "", color: "#1", nextTickAt: 0, hustleMode: 0 });
    agentRepo(db).upsert({ id: "002", name: "Bob",   role: "r", tagline: "", color: "#2", nextTickAt: 0, hustleMode: 0 });
    agentRepo(db).upsert({ id: "003", name: "Charlie", role: "r", tagline: "", color: "#3", nextTickAt: 0, hustleMode: 0 });
    repo = dmRepo(db);
    handle = await startHttp({
      port: 0, db,
      getBalance: async () => 0,
      ledgerGet: async () => ({ ok: true, status: 200, body: {} }),
      dmRepo: repo
    });
  });
  afterEach(async () => { handle.server.close(); db.close(); });

  it("returns both sent and received DMs for the agent, newest-first", async () => {
    const now = 1_000_000;
    repo.insert({ id: "dm_a", fromAgentId: "001", toAgentId: "002", text: "from alice",    inReplyTo: null, inReplyKind: null, createdAt: now + 0, expiresAt: now + 600_000 });
    repo.insert({ id: "dm_b", fromAgentId: "002", toAgentId: "001", text: "back to alice", inReplyTo: null, inReplyKind: null, createdAt: now + 1, expiresAt: now + 600_000 });
    repo.insert({ id: "dm_c", fromAgentId: "002", toAgentId: "003", text: "not involving alice", inReplyTo: null, inReplyKind: null, createdAt: now + 2, expiresAt: now + 600_000 });
    const res = await fetch(`http://127.0.0.1:${handle.port}/dms/agent/001`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentId).toBe("001");
    expect(body.dms.map((d: any) => d.id)).toEqual(["dm_b", "dm_a"]);
  });

  it("returns 404 for unknown agent id", async () => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/dms/agent/999`);
    expect(res.status).toBe(404);
  });

  it("returns 503 when dmRepo not configured", async () => {
    const db2 = new Database(":memory:");
    runMigrations(db2);
    agentRepo(db2).upsert({ id: "001", name: "Alice", role: "r", tagline: "", color: "#1", nextTickAt: 0, hustleMode: 0 });
    const h2 = await startHttp({
      port: 0, db: db2,
      getBalance: async () => 0,
      ledgerGet: async () => ({ ok: true, status: 200, body: {} })
    });
    try {
      const res = await fetch(`http://127.0.0.1:${h2.port}/dms/agent/001`);
      expect(res.status).toBe(503);
    } finally {
      h2.server.close();
      db2.close();
    }
  });

  it("caps at 50 results", async () => {
    for (let i = 0; i < 60; i++) {
      repo.insert({
        id: `dm_${String(i).padStart(3, "0")}_0000`,
        fromAgentId: "001", toAgentId: "002",
        text: `msg ${i}`, inReplyTo: null, inReplyKind: null,
        createdAt: 1_000_000 + i, expiresAt: 1_000_000 + 600_000
      });
    }
    const res = await fetch(`http://127.0.0.1:${handle.port}/dms/agent/001`);
    const body = await res.json();
    expect(body.dms.length).toBe(50);
  });
});
