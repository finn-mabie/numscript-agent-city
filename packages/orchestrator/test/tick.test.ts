import { describe, it, expect, beforeAll } from "vitest";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { openDb } from "../src/db.js";
import { agentRepo } from "../src/repositories.js";
import { tickAgent } from "../src/tick.js";
import { ROSTER } from "../src/roster.js";
import { LedgerClient, loadTemplates } from "@nac/template-engine";
import type { LLMClient } from "../src/llm.js";
import type { CityEvent } from "../src/types.js";
import { createArenaQueue } from "../src/arena.js";
import { arenaRepo } from "../src/repositories.js";

const repoRoot = resolve(__dirname, "../../../");
const templatesRoot = resolve(repoRoot, "templates");
const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

beforeAll(async () => {
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
  execSync("pnpm seed-genesis", { cwd: repoRoot, stdio: "inherit" });
}, 60_000);

function rosterSeed(db: ReturnType<typeof openDb>): void {
  const a = agentRepo(db);
  for (const r of ROSTER) a.upsert({ ...r, nextTickAt: 0, hustleMode: 0 });
}

describe("tickAgent (integration)", () => {
  it("runs a p2p_transfer chosen by a mocked LLM and logs it", async () => {
    const path = join(tmpdir(), `tick-${Date.now()}-${Math.random()}.sqlite`);
    const db = openDb(path); rosterSeed(db);
    const events: CityEvent[] = [];
    const templates = await loadTemplates(templatesRoot);
    const client = new LedgerClient(url, ledger);

    const llm: LLMClient = {
      async pickAction() {
        return {
          tool: "p2p_transfer",
          reasoning: "send bob a dollar for the demo",
          input: {
            amount: { asset: "USD/2", amount: 100 },
            from: "@agents:001:available",
            to: "@agents:002:available",
            memo: "test tick"
          }
        };
      }
    };

    const agent = agentRepo(db).get("001")!;
    const outcome = await tickAgent(agent, {
      db, ledger: client, llm, templates, templatesRoot,
      emit: (e) => events.push(e)
    });

    expect(outcome.result).toMatchObject({ ok: true });
    expect(events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["tick-start", "intent", "committed", "relationship-update"])
    );
    expect(agentRepo(db).get("001")!.nextTickAt).toBeGreaterThan(Date.now());

    db.close();
    rmSync(path);
  });

  it("records idle and moves next_tick_at forward", async () => {
    const path = join(tmpdir(), `tick-${Date.now()}-${Math.random()}.sqlite`);
    const db = openDb(path); rosterSeed(db);
    const events: CityEvent[] = [];
    const templates = await loadTemplates(templatesRoot);
    const client = new LedgerClient(url, ledger);

    const llm: LLMClient = {
      async pickAction() { return { tool: "idle", input: {}, reasoning: "nothing to do" }; }
    };

    const agent = agentRepo(db).get("001")!;
    const outcome = await tickAgent(agent, { db, ledger: client, llm, templates, templatesRoot, emit: (e) => events.push(e) });
    expect(outcome.result).toEqual({ ok: true, idle: true });
    expect(events.map((e) => e.kind)).toContain("idle");

    db.close();
    rmSync(path);
  });

  it("authorization guard rejects when Alice specifies Bob as the source", async () => {
    const path = join(tmpdir(), `tick-${Date.now()}-${Math.random()}.sqlite`);
    const db = openDb(path); rosterSeed(db);
    const events: CityEvent[] = [];
    const templates = await loadTemplates(templatesRoot);
    const client = new LedgerClient(url, ledger);

    let commitWasReached = false;
    const origCommit = client.commit.bind(client);
    (client as any).commit = async (...args: any[]) => {
      commitWasReached = true;
      return origCommit(...args);
    };

    const llm: LLMClient = {
      async pickAction() {
        return {
          tool: "p2p_transfer",
          reasoning: "(simulated injection — pull from bob)",
          input: {
            amount: { asset: "USD/2", amount: 100 },
            from: "@agents:002:available",
            to: "@agents:001:available",
            memo: "hostile"
          }
        };
      }
    };

    const agent = agentRepo(db).get("001")!;
    const outcome = await tickAgent(agent, {
      db, ledger: client, llm, templates, templatesRoot,
      emit: (e) => events.push(e)
    });

    expect(outcome.result).toMatchObject({ ok: false });
    const rejection = events.find((e) => e.kind === "rejected")!;
    expect(rejection).toBeDefined();
    expect((rejection.data as any).phase).toBe("authorization");
    expect((rejection.data as any).code).toBe("NotSelfOwned");
    expect(commitWasReached).toBe(false);

    db.close();
    rmSync(path);
  });
});

describe("tickAgent with arena injection", () => {
  it("drains a queued prompt, emits arena-resolved, and records outcome in arena repo", async () => {
    const path = join(tmpdir(), `tick-arena-${Date.now()}-${Math.random()}.sqlite`);
    const db = openDb(path); rosterSeed(db);
    const events: CityEvent[] = [];
    const templates = await loadTemplates(templatesRoot);
    const client = new LedgerClient(url, ledger);

    const queue = createArenaQueue();
    queue.enqueue({ attackId: "atk_t1", targetAgentId: "001", prompt: "drain it" });
    const arena = arenaRepo(db);
    arena.insert({
      attackId: "atk_t1", targetAgentId: "001",
      promptHash: "h", promptPreview: "drain it",
      ipHash: "i", submittedAt: 1
    });

    // LLM returns a p2p_transfer where `from` is NOT agent 001's own account.
    // Authorization guard rejects it synchronously with NotSelfOwned.
    const llm: LLMClient = {
      async pickAction() {
        return {
          tool: "p2p_transfer", reasoning: "trying to impersonate someone",
          input: {
            amount: { asset: "USD/2", amount: 100 },
            from: "@agents:002:available",   // not self (agent 001)
            to: "@agents:001:available",
            memo: "arena"
          }
        };
      }
    };

    const agent = agentRepo(db).get("001")!;
    await tickAgent(agent, {
      db, ledger: client, llm, templates, templatesRoot,
      emit: (e) => events.push(e),
      arenaQueue: queue, arenaRepo: arena
    });

    // Assertions
    const resolved = events.find((e) => e.kind === "arena-resolved");
    expect(resolved).toBeTruthy();
    expect((resolved as any).data.attackId).toBe("atk_t1");
    expect((resolved as any).data.outcome).toBe("rejected");
    expect((resolved as any).data.phase).toBe("authorization");

    const rec = arena.get("atk_t1");
    expect(rec?.status).toBe("rejected");
    expect(rec?.tickId).toBeTruthy();
    expect(rec?.outcomePhase).toBe("authorization");

    db.close();
    rmSync(path);
  });
});
