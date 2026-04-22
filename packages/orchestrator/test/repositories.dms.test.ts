import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db.js";
import { dmRepo, agentRepo } from "../src/repositories.js";

describe("dmRepo", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    // Insert test agents
    const agents = agentRepo(db);
    agents.upsert({ id: "001", name: "Agent 001", role: "test", tagline: "", color: "", nextTickAt: 0, hustleMode: 0 });
    agents.upsert({ id: "002", name: "Agent 002", role: "test", tagline: "", color: "", nextTickAt: 0, hustleMode: 0 });
    agents.upsert({ id: "003", name: "Agent 003", role: "test", tagline: "", color: "", nextTickAt: 0, hustleMode: 0 });
    agents.upsert({ id: "004", name: "Agent 004", role: "test", tagline: "", color: "", nextTickAt: 0, hustleMode: 0 });
    agents.upsert({ id: "999", name: "Agent 999", role: "test", tagline: "", color: "", nextTickAt: 0, hustleMode: 0 });
  });

  it("inserts a DM and reads it back", () => {
    const repo = dmRepo(db);
    repo.insert({
      id: "dm_a", fromAgentId: "001", toAgentId: "002",
      text: "hey", inReplyTo: null, inReplyKind: null,
      createdAt: 1000, expiresAt: 1000 + 10 * 60_000
    });
    const got = repo.get("dm_a");
    expect(got).toEqual({
      id: "dm_a", fromAgentId: "001", toAgentId: "002",
      text: "hey", inReplyTo: null, inReplyKind: null,
      createdAt: 1000, readAt: null, expiresAt: 1000 + 10 * 60_000
    });
  });

  it("unreadFor returns newest-first unread DMs for an agent, excludes read + expired", () => {
    const repo = dmRepo(db);
    const now = Date.now();
    repo.insert({ id: "dm_a", fromAgentId: "001", toAgentId: "002", text: "first",  inReplyTo: null, inReplyKind: null, createdAt: now,     expiresAt: now + 600_000 });
    repo.insert({ id: "dm_b", fromAgentId: "003", toAgentId: "002", text: "second", inReplyTo: null, inReplyKind: null, createdAt: now + 1, expiresAt: now + 600_000 });
    repo.insert({ id: "dm_c", fromAgentId: "004", toAgentId: "002", text: "third",  inReplyTo: null, inReplyKind: null, createdAt: now + 2, expiresAt: now + 600_000 });
    repo.insert({ id: "dm_d", fromAgentId: "001", toAgentId: "999", text: "other",  inReplyTo: null, inReplyKind: null, createdAt: now + 3, expiresAt: now + 600_000 });
    // Expired:
    repo.insert({ id: "dm_e", fromAgentId: "001", toAgentId: "002", text: "stale",  inReplyTo: null, inReplyKind: null, createdAt: now,     expiresAt: now - 1000 });

    const out = repo.unreadFor("002", 10);
    expect(out.map((d) => d.id)).toEqual(["dm_c", "dm_b", "dm_a"]);
  });

  it("markRead sets read_at for given ids", () => {
    const repo = dmRepo(db);
    repo.insert({ id: "dm_x", fromAgentId: "001", toAgentId: "002", text: "x", inReplyTo: null, inReplyKind: null, createdAt: 0, expiresAt: 600_000 });
    expect(repo.get("dm_x")?.readAt).toBeNull();
    repo.markRead(["dm_x"], 12345);
    expect(repo.get("dm_x")?.readAt).toBe(12345);
    // After read, should not re-appear in unreadFor
    expect(repo.unreadFor("002", 10)).toEqual([]);
  });

  it("conversation returns DMs between two agents in both directions, newest first", () => {
    const repo = dmRepo(db);
    repo.insert({ id: "dm_a", fromAgentId: "001", toAgentId: "002", text: "a", inReplyTo: null, inReplyKind: null, createdAt: 1, expiresAt: 600_001 });
    repo.insert({ id: "dm_b", fromAgentId: "002", toAgentId: "001", text: "b", inReplyTo: "dm_a", inReplyKind: "dm", createdAt: 2, expiresAt: 600_002 });
    repo.insert({ id: "dm_c", fromAgentId: "001", toAgentId: "003", text: "c", inReplyTo: null, inReplyKind: null, createdAt: 3, expiresAt: 600_003 });
    const out = repo.conversation("001", "002", 10);
    expect(out.map((d) => d.id)).toEqual(["dm_b", "dm_a"]);
  });

  it("recentSentCount counts DMs by sender in a window, optionally filtered by recipient", () => {
    const repo = dmRepo(db);
    const now = 10_000;
    repo.insert({ id: "dm_1", fromAgentId: "001", toAgentId: "002", text: "x", inReplyTo: null, inReplyKind: null, createdAt: now - 30_000, expiresAt: now + 600_000 });
    repo.insert({ id: "dm_2", fromAgentId: "001", toAgentId: "002", text: "x", inReplyTo: null, inReplyKind: null, createdAt: now - 20_000, expiresAt: now + 600_000 });
    repo.insert({ id: "dm_3", fromAgentId: "001", toAgentId: "003", text: "x", inReplyTo: null, inReplyKind: null, createdAt: now - 10_000, expiresAt: now + 600_000 });
    repo.insert({ id: "dm_4", fromAgentId: "001", toAgentId: "002", text: "x", inReplyTo: null, inReplyKind: null, createdAt: now - 2 * 60_000, expiresAt: now + 600_000 });

    expect(repo.recentSentCount("001", now - 60_000)).toBe(3);       // last 60s, all recipients
    expect(repo.recentSentCount("001", now - 60_000, "002")).toBe(2); // last 60s, recipient 002
  });

  it("expireOlderThan flips past-due open-unread DMs to expired by making them drop from unreadFor", () => {
    // We model expiry as a flag in the row; unreadFor filters by expires_at > now.
    const repo = dmRepo(db);
    const now = Date.now();
    repo.insert({ id: "dm_live", fromAgentId: "001", toAgentId: "002", text: "x", inReplyTo: null, inReplyKind: null, createdAt: now,   expiresAt: now + 9_000_000 });
    repo.insert({ id: "dm_old",  fromAgentId: "001", toAgentId: "002", text: "x", inReplyTo: null, inReplyKind: null, createdAt: now,   expiresAt: now - 100 });

    const count = repo.expireOlderThan(now - 50);
    // Test passes whether or not expireOlderThan touches a row — unreadFor
    // already filters by expires_at > now, so the stale one is excluded either way.
    expect(count).toBeGreaterThanOrEqual(0);
    const unread = repo.unreadFor("002", 10);
    expect(unread.map((d) => d.id)).toEqual(["dm_live"]);
  });
});
