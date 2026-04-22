import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, agentRepo } from "../src/index.js";
import { startHttp } from "../src/http.js";
import { priceSignalRepo } from "../src/repositories.js";

async function post(port: number, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

describe("market HTTP", () => {
  let db: Database.Database;
  let handle: Awaited<ReturnType<typeof startHttp>>;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    handle = await startHttp({
      port: 0, db,
      getBalance: async () => 0,
      ledgerGet: async () => ({ ok: true, status: 200, body: { cursor: { data: [] } } }),
      priceSignalRepo: priceSignalRepo(db),
      priceSignalSalt: "test-salt",
      priceSignalRateLimit: { max: 2, windowMs: 5 * 60_000 }
    });
  });
  afterEach(async () => { handle.server.close(); db.close(); });

  it("POST accepts a valid signal", async () => {
    const res = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
      { targetPrice: 500, durationMs: 600_000, note: "pay 2x" },
      { "x-forwarded-for": "1.1.1.1" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.signalId).toMatch(/^ps_/);
    expect(body.assetCode).toBe("STRAWBERRY/0");
  });

  it("POST rejects unknown asset with 404", async () => {
    const res = await post(handle.port, "/market/MYSTERY%2F0/signal",
      { targetPrice: 500 });
    expect(res.status).toBe(404);
  });

  it("POST rejects missing targetPrice with 400", async () => {
    const res = await post(handle.port, "/market/STRAWBERRY%2F0/signal", {});
    expect(res.status).toBe(400);
  });

  it("POST rate-limits per IP", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
        { targetPrice: 500 },
        { "x-forwarded-for": "9.9.9.9" });
      expect(r.status).toBe(202);
    }
    const blocked = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
      { targetPrice: 500 },
      { "x-forwarded-for": "9.9.9.9" });
    expect(blocked.status).toBe(429);
  });

  it("GET /market/:asset returns active signal + vwap stub", async () => {
    const set = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
      { targetPrice: 500, durationMs: 600_000 });
    expect(set.status).toBe(202);
    const res = await fetch(`http://127.0.0.1:${handle.port}/market/STRAWBERRY%2F0`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assetCode).toBe("STRAWBERRY/0");
    expect(body.signal?.targetPrice).toBe(500);
    // vwap is null here because ledgerGet returns empty cursor
    expect(body.vwap).toBeNull();
  });
});
