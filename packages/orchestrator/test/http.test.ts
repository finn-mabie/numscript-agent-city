import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { agentRepo, intentLogRepo } from "../src/repositories.js";
import { ROSTER } from "../src/roster.js";
import { startHttp } from "../src/http.js";
import type { Server } from "node:http";

describe("startHttp /snapshot", () => {
  let dbPath: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `nac-http-${Date.now()}-${Math.random()}.sqlite`);
    const db = openDb(dbPath);
    const ag = agentRepo(db);
    for (const r of ROSTER) ag.upsert({ ...r, nextTickAt: 0, hustleMode: 0 });

    const log = intentLogRepo(db);
    log.insert({
      agentId: "001", tickId: "001:1", reasoning: "demo",
      templateId: "p2p_transfer", params: { memo: "hi" },
      outcome: "committed", errorPhase: null, errorCode: null, txId: "42", createdAt: 1
    });

    const handle = await startHttp({
      port: 0,
      db,
      getBalance: async () => 10000,
      ledgerGet: async () => ({ ok: true, status: 200, body: { data: { volumes: { "USD/2": { balance: 10000 } }, metadata: {} } } })
    });
    server = handle.server;
    baseUrl = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    server.close();
    rmSync(dbPath, { force: true });
  });

  it("returns current agents, balances, and recent intent log entries", async () => {
    const res = await fetch(`${baseUrl}/snapshot`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(10);
    expect(body.agents[0].id).toBe("001");
    expect(body.agents[0].balance).toBe(10000); // per the mocked getBalance
    expect(body.recent).toBeInstanceOf(Array);
    // Recent should include the 001:1 demo entry
    expect(body.recent.find((e: any) => e.tickId === "001:1")).toBeDefined();
  });

  it("CORS: responds to OPTIONS preflight and includes Access-Control-Allow-Origin", async () => {
    const res = await fetch(`${baseUrl}/snapshot`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("404s unknown paths", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });
});
