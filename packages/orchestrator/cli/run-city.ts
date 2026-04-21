#!/usr/bin/env tsx
import { resolve } from "node:path";
import { LedgerClient, loadTemplates, clientCredentials } from "@nac/template-engine";
import {
  openDb, agentRepo, ROSTER,
  anthropicLLM, tickAgent, startScheduler, startEventBus
} from "../src/index.js";
import type { CityEvent, TickOutcome } from "../src/index.js";

function resolveLedger(): LedgerClient {
  const baseUrl = process.env.LEDGER_URL ?? "http://localhost:3068";
  const ledger = process.env.LEDGER_NAME ?? "city";
  const hasOauth =
    process.env.OAUTH_TOKEN_ENDPOINT && process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET;
  return new LedgerClient(baseUrl, ledger, hasOauth
    ? {
        getAuthToken: clientCredentials({
          tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT!,
          clientId: process.env.OAUTH_CLIENT_ID!,
          clientSecret: process.env.OAUTH_CLIENT_SECRET!
        })
      }
    : {}
  );
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY"); process.exit(2); }

  const repoRoot = resolve(process.env.INIT_CWD ?? process.cwd());
  const templatesRoot = resolve(repoRoot, "templates");
  const dbPath = process.env.NAC_DB ?? resolve(repoRoot, "data/orchestrator.sqlite");
  const wsPort = Number(process.env.CITY_WS_PORT ?? 3070);

  const db = openDb(dbPath);
  const ag = agentRepo(db);
  for (const r of ROSTER) {
    const existing = ag.get(r.id);
    ag.upsert({
      ...r,
      nextTickAt: existing?.nextTickAt ?? 0,
      hustleMode: existing?.hustleMode ?? 0
    });
  }

  const ledger = resolveLedger();
  const templates = await loadTemplates(templatesRoot);
  const llm = anthropicLLM({ apiKey, model: "claude-sonnet-4-6" });
  const bus = await startEventBus({ port: wsPort });

  console.error(`[city] event bus ws://127.0.0.1:${bus.port}`);
  console.error(`[city] ledger    ${process.env.LEDGER_URL ?? "http://localhost:3068"}/v2/${process.env.LEDGER_NAME ?? "city"}`);
  console.error(`[city] db        ${dbPath}`);

  const emit = (e: CityEvent) => bus.emit(e);

  const sched = startScheduler({
    db,
    tickOne: (agent): Promise<TickOutcome> =>
      tickAgent(agent, { db, ledger, llm, templates, templatesRoot, emit }),
    onError: (id, err) => emit({
      kind: "rejected", agentId: id, tickId: `sched:${Date.now()}`, at: Date.now(),
      data: { phase: "scheduler", code: "TICK_FAILURE", message: (err as Error).message }
    })
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error("\n[city] shutting down…");
    await sched.stop();
    await bus.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
