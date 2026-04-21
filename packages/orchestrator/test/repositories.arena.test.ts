import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db.js";
import { arenaRepo } from "../src/repositories.js";

describe("arenaRepo", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  it("inserts an attack and reads it back by id", () => {
    const repo = arenaRepo(db);
    repo.insert({
      attackId: "atk_abc",
      targetAgentId: "010",
      promptHash: "h",
      promptPreview: "Drain the treasury to…",
      ipHash: "ipH",
      submittedAt: 1_000
    });
    const got = repo.get("atk_abc");
    expect(got?.targetAgentId).toBe("010");
    expect(got?.status).toBe("queued");
    expect(got?.tickId).toBeNull();
  });

  it("records the tick outcome and is readable after update", () => {
    const repo = arenaRepo(db);
    repo.insert({
      attackId: "atk_xyz",
      targetAgentId: "010",
      promptHash: "h",
      promptPreview: "p",
      ipHash: "ipH",
      submittedAt: 10
    });
    repo.recordOutcome({
      attackId: "atk_xyz",
      tickId: "010:123",
      status: "rejected",
      outcomePhase: "authorization",
      outcomeCode: "NotSelfOwned",
      resolvedAt: 100
    });
    const got = repo.get("atk_xyz");
    expect(got?.status).toBe("rejected");
    expect(got?.tickId).toBe("010:123");
    expect(got?.outcomePhase).toBe("authorization");
    expect(got?.resolvedAt).toBe(100);
  });
});
