import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db.js";
import { priceSignalRepo } from "../src/repositories.js";

describe("priceSignalRepo", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  it("inserts and reads back a signal", () => {
    const repo = priceSignalRepo(db);
    repo.insert({
      id: "ps_a", assetCode: "STRAWBERRY/0", targetPrice: 500,
      setByIpHash: "h", setAt: 1000, expiresAt: 1000 + 600_000, note: "pay 2x"
    });
    const got = repo.get("ps_a");
    expect(got).toEqual({
      id: "ps_a", assetCode: "STRAWBERRY/0", targetPrice: 500,
      setByIpHash: "h", setAt: 1000, expiresAt: 1000 + 600_000, note: "pay 2x"
    });
  });

  it("activeFor returns the most recent non-expired signal for an asset", () => {
    const repo = priceSignalRepo(db);
    const now = 10_000;
    repo.insert({ id: "ps_old", assetCode: "STRAWBERRY/0", targetPrice: 100, setByIpHash: "h", setAt: now - 1000, expiresAt: now - 100, note: null });
    repo.insert({ id: "ps_new", assetCode: "STRAWBERRY/0", targetPrice: 500, setByIpHash: "h", setAt: now,        expiresAt: now + 600_000, note: null });
    repo.insert({ id: "ps_oth", assetCode: "USD/2",        targetPrice: 100, setByIpHash: "h", setAt: now,        expiresAt: now + 600_000, note: null });
    const active = repo.activeFor("STRAWBERRY/0", now);
    expect(active?.id).toBe("ps_new");
  });

  it("activeFor returns null if no active signal", () => {
    const repo = priceSignalRepo(db);
    expect(repo.activeFor("STRAWBERRY/0", Date.now())).toBeNull();
  });

  it("recentByIp counts signals in a window", () => {
    const repo = priceSignalRepo(db);
    const now = 10_000;
    repo.insert({ id: "a", assetCode: "USD/2", targetPrice: 1, setByIpHash: "x", setAt: now - 30_000, expiresAt: now + 600_000, note: null });
    repo.insert({ id: "b", assetCode: "USD/2", targetPrice: 1, setByIpHash: "x", setAt: now - 10_000, expiresAt: now + 600_000, note: null });
    repo.insert({ id: "c", assetCode: "USD/2", targetPrice: 1, setByIpHash: "y", setAt: now - 10_000, expiresAt: now + 600_000, note: null });
    expect(repo.recentByIp("x", now - 60_000)).toBe(2);
    expect(repo.recentByIp("y", now - 60_000)).toBe(1);
  });
});
