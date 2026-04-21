import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db.js";
import { offerRepo } from "../src/repositories.js";

describe("offerRepo", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  it("inserts a root offer and reads it back as open", () => {
    const repo = offerRepo(db);
    repo.insert({
      id: "off_a",
      authorAgentId: "001",
      text: "need writer for $8",
      inReplyTo: null,
      createdAt: 1000,
      expiresAt: 1000 + 5 * 60_000
    });
    const got = repo.get("off_a");
    expect(got).toEqual({
      id: "off_a",
      authorAgentId: "001",
      text: "need writer for $8",
      inReplyTo: null,
      createdAt: 1000,
      expiresAt: 1000 + 5 * 60_000,
      status: "open",
      closedByTx: null,
      closedByAgent: null,
      closedAt: null
    });
  });

  it("openOffers returns newest-first and excludes given author", () => {
    const repo = offerRepo(db);
    repo.insert({ id: "off_a", authorAgentId: "001", text: "a", inReplyTo: null, createdAt: 1, expiresAt: 9_999_999_999_999 });
    repo.insert({ id: "off_b", authorAgentId: "002", text: "b", inReplyTo: null, createdAt: 2, expiresAt: 9_999_999_999_999 });
    repo.insert({ id: "off_c", authorAgentId: "001", text: "c", inReplyTo: null, createdAt: 3, expiresAt: 9_999_999_999_999 });
    const forAgent002 = repo.openOffers(10, "002");
    expect(forAgent002.map((o) => o.id)).toEqual(["off_c", "off_a"]);
  });

  it("threadOf returns root + its direct replies", () => {
    const repo = offerRepo(db);
    repo.insert({ id: "off_root", authorAgentId: "001", text: "root", inReplyTo: null, createdAt: 1, expiresAt: 9_999_999_999_999 });
    repo.insert({ id: "off_r1",   authorAgentId: "002", text: "r1",   inReplyTo: "off_root", createdAt: 2, expiresAt: 9_999_999_999_999 });
    repo.insert({ id: "off_r2",   authorAgentId: "003", text: "r2",   inReplyTo: "off_root", createdAt: 3, expiresAt: 9_999_999_999_999 });
    const thread = repo.threadOf("off_root");
    expect(thread.map((o) => o.id).sort()).toEqual(["off_r1", "off_r2", "off_root"]);
  });

  it("close marks an offer closed with tx + agent + timestamp", () => {
    const repo = offerRepo(db);
    repo.insert({ id: "off_a", authorAgentId: "001", text: "x", inReplyTo: null, createdAt: 1, expiresAt: 9_999_999_999_999 });
    repo.close({ id: "off_a", closedByTx: "tx42", closedByAgent: "002", closedAt: 100 });
    const got = repo.get("off_a");
    expect(got?.status).toBe("closed");
    expect(got?.closedByTx).toBe("tx42");
    expect(got?.closedByAgent).toBe("002");
    expect(got?.closedAt).toBe(100);
  });

  it("expireOlderThan flips open rows past expires_at and returns count", () => {
    const repo = offerRepo(db);
    repo.insert({ id: "off_a", authorAgentId: "001", text: "a", inReplyTo: null, createdAt: 1, expiresAt: 100 });
    repo.insert({ id: "off_b", authorAgentId: "001", text: "b", inReplyTo: null, createdAt: 1, expiresAt: 9_999_999_999_999 });
    const count = repo.expireOlderThan(200);
    expect(count).toBe(1);
    expect(repo.get("off_a")?.status).toBe("expired");
    expect(repo.get("off_b")?.status).toBe("open");
  });

  it("openOffers without excludingAuthor returns all open", () => {
    const repo = offerRepo(db);
    repo.insert({ id: "off_a", authorAgentId: "001", text: "a", inReplyTo: null, createdAt: 1, expiresAt: 9_999_999_999_999 });
    repo.insert({ id: "off_b", authorAgentId: "002", text: "b", inReplyTo: null, createdAt: 2, expiresAt: 9_999_999_999_999 });
    expect(repo.openOffers(10).map((o) => o.id)).toEqual(["off_b", "off_a"]);
  });

  it("openOffers excludes stale (past-expires_at) rows even if still status=open", () => {
    const repo = offerRepo(db);
    // This row is technically still "open" — no sweeper ran — but already expired.
    repo.insert({ id: "off_stale", authorAgentId: "001", text: "stale", inReplyTo: null, createdAt: 1, expiresAt: 100 });
    repo.insert({ id: "off_live",  authorAgentId: "001", text: "live",  inReplyTo: null, createdAt: 2, expiresAt: 9_999_999_999_999 });
    const out = repo.openOffers(10);
    expect(out.map((o) => o.id)).toEqual(["off_live"]);
  });
});
