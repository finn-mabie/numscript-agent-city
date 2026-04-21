#!/usr/bin/env tsx
import { resolve } from "node:path";
import { LedgerClient, loadTemplates, clientCredentials } from "@nac/template-engine";
import {
  anthropicLLM, tickAgent, openDb, agentRepo, ROSTER
} from "../src/index.js";
import type { CityEvent } from "../src/index.js";

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
  const [, , agentId = "001"] = process.argv;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY"); process.exit(2); }

  const repoRoot = resolve(process.env.INIT_CWD ?? process.cwd());
  const templatesRoot = resolve(repoRoot, "templates");
  const dbPath = process.env.NAC_DB ?? resolve(repoRoot, "data/orchestrator.sqlite");

  const db = openDb(dbPath);
  const ag = agentRepo(db);
  for (const r of ROSTER) {
    if (!ag.get(r.id)) ag.upsert({ ...r, nextTickAt: 0, hustleMode: 0 });
  }

  const agent = ag.get(agentId);
  if (!agent) { console.error(`No such agent: ${agentId}`); process.exit(1); }

  const ledger = resolveLedger();
  const templates = await loadTemplates(templatesRoot);
  const llm = anthropicLLM({ apiKey, model: "claude-sonnet-4-6" });

  const emit = (e: CityEvent) => console.log(JSON.stringify(e));
  const outcome = await tickAgent(agent, { db, ledger, llm, templates, templatesRoot, emit });

  console.error(`\nOutcome: ${JSON.stringify(outcome.result)}  (duration ${outcome.durationMs}ms)`);
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
