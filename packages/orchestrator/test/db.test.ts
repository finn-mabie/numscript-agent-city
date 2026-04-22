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
      expect.arrayContaining(["agents", "relationships", "intent_log", "arena_attacks", "offers", "dms", "assets", "price_signals", "schema_version"])
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
    expect(versions).toHaveLength(6);
    db.close();
    rmSync(path);
  });
});
