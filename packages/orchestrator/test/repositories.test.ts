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

  it("relationships: upsert + top + bottom + idempotent overwrite", () => {
    const r = relationshipsRepo(db);
    r.upsert({ agentId: "001", peerId: "002", trust: 0.4, lastInteractionAt: 100 });
    r.upsert({ agentId: "001", peerId: "003", trust: -0.2, lastInteractionAt: 200 });
    r.upsert({ agentId: "001", peerId: "004", trust: 0.9, lastInteractionAt: 300 });

    // Top is trust DESC: 004 (0.9), 002 (0.4)
    expect(r.top("001", 2).map((x) => x.peerId)).toEqual(["004", "002"]);
    // Bottom is trust ASC: 003 (-0.2) first
    expect(r.bottom("001", 1)[0].peerId).toBe("003");

    // Idempotent overwrite of the same (agent, peer) pair
    r.upsert({ agentId: "001", peerId: "002", trust: 0.5, lastInteractionAt: 400 });
    expect(r.top("001", 3).find((x) => x.peerId === "002")?.trust).toBe(0.5);
  });

  it("intent_log: insert and recent by agent (newest first, params round-trip)", () => {
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
