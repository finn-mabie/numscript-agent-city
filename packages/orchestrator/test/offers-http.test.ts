import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, agentRepo } from "../src/index.js";
import { startHttp } from "../src/http.js";
import { offerRepo } from "../src/repositories.js";

describe("offers HTTP", () => {
  let db: Database.Database;
  let handle: Awaited<ReturnType<typeof startHttp>>;
  let repo: ReturnType<typeof offerRepo>;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    agentRepo(db).upsert({ id: "001", name: "Alice", role: "r", tagline: "", color: "#1", nextTickAt: 0, hustleMode: 0 });
    repo = offerRepo(db);
    handle = await startHttp({
      port: 0, db,
      getBalance: async () => 0,
      ledgerGet: async () => ({ ok: true, status: 200, body: {} }),
      offerRepo: repo
    });
  });
  afterEach(async () => { handle.server.close(); db.close(); });

  it("GET /offers returns open offers newest first", async () => {
    repo.insert({ id: "off_a", authorAgentId: "001", text: "a", inReplyTo: null, createdAt: 1000, expiresAt: 9_999_999_999_999 });
    repo.insert({ id: "off_b", authorAgentId: "001", text: "b", inReplyTo: null, createdAt: 2000, expiresAt: 9_999_999_999_999 });
    const res = await fetch(`http://127.0.0.1:${handle.port}/offers`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.offers.map((o: any) => o.id)).toEqual(["off_b", "off_a"]);
  });

  it("GET /offers/:id returns the offer + thread", async () => {
    repo.insert({ id: "off_root", authorAgentId: "001", text: "root", inReplyTo: null, createdAt: 1, expiresAt: 9_999_999_999_999 });
    repo.insert({ id: "off_r1",   authorAgentId: "001", text: "r1",   inReplyTo: "off_root", createdAt: 2, expiresAt: 9_999_999_999_999 });
    const res = await fetch(`http://127.0.0.1:${handle.port}/offers/off_root`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.offer.id).toBe("off_root");
    expect(body.thread.map((o: any) => o.id).sort()).toEqual(["off_r1", "off_root"]);
  });

  it("GET /offers/:id returns 404 for unknown id", async () => {
    const res = await fetch(`http://127.0.0.1:${handle.port}/offers/off_missing_0000`);
    expect(res.status).toBe(404);
  });

  it("returns 503 when offerRepo not configured", async () => {
    const db2 = new Database(":memory:");
    runMigrations(db2);
    const h2 = await startHttp({ port: 0, db: db2, getBalance: async () => 0, ledgerGet: async () => ({ ok: true, status: 200, body: {} }) });
    try {
      const res = await fetch(`http://127.0.0.1:${h2.port}/offers`);
      expect(res.status).toBe(503);
    } finally {
      h2.server.close();
      db2.close();
    }
  });
});
