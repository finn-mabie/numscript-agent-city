import { describe, it, expect } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { agentRepo } from "../src/repositories.js";
import { startScheduler } from "../src/scheduler.js";
import { ROSTER } from "../src/roster.js";
import type { AgentRecord, TickOutcome } from "../src/types.js";

describe("scheduler", () => {
  it("wakes only due agents, serially, and continues on per-agent errors", async () => {
    const path = join(tmpdir(), `sched-${Date.now()}.sqlite`);
    const db = openDb(path);
    const ag = agentRepo(db);

    let now = 1000;
    for (const r of ROSTER) {
      ag.upsert({ ...r, nextTickAt: r.id === "001" ? 500 : 5000, hustleMode: 0 });
    }

    const ticked: string[] = [];
    const sched = startScheduler({
      db,
      now: () => now,
      intervalMs: 10,
      tickOne: async (agent: AgentRecord): Promise<TickOutcome> => {
        ticked.push(agent.id);
        if (agent.id === "001") throw new Error("boom");
        return { tickId: `${agent.id}:${now}`, agentId: agent.id, durationMs: 0, result: { ok: true, idle: true } };
      }
    });

    // Advance to a point where only "001" is due
    await new Promise((r) => setTimeout(r, 50));
    expect(ticked).toEqual(["001"]); // ran despite throwing

    now = 6000;
    await new Promise((r) => setTimeout(r, 50));
    expect(ticked.length).toBeGreaterThanOrEqual(2); // some others now due

    await sched.stop();
    db.close();
    rmSync(path);
  });
});
