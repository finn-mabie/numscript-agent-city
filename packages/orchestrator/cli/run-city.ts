#!/usr/bin/env tsx
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { LedgerClient, loadTemplates, clientCredentials } from "@nac/template-engine";

// Auto-load .env from the repo root so `pnpm city:start` works without
// manual `export` incantations. Walks up from cwd looking for the nearest
// .env. Values already set in the shell win (don't clobber).
(function loadDotenv() {
  const candidates = [
    process.env.INIT_CWD,
    process.cwd(),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "../.."),
    resolve(process.cwd(), "../../..")
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    const envPath = resolve(dir, ".env");
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
      if (!m) continue;
      const [, key, rawVal] = m;
      // Only skip if shell has a non-empty value — empty strings in the shell
      // are usually accidental leftovers and should NOT block the .env file.
      if (process.env[key]) continue;
      process.env[key] = rawVal.replace(/^['"]|['"]$/g, "");
    }
    break; // first match wins
  }
})();
import {
  openDb, agentRepo, ROSTER,
  anthropicLLM, tickAgent, startScheduler, startEventBus,
  createArenaQueue, arenaRepo,
  offerRepo
} from "../src/index.js";
import type { CityEvent, TickOutcome } from "../src/index.js";
import { startHttp } from "../src/http.js";

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

  const arenaQueue = createArenaQueue();
  const arena = arenaRepo(db);
  const offers = offerRepo(db);
  const envSalt = process.env.ARENA_SALT;
  const saltIsValid = typeof envSalt === "string" && envSalt.length >= 16;
  const arenaSalt = saltIsValid ? envSalt! : randomBytes(24).toString("hex");
  const saltSource = saltIsValid
    ? "env-provided"
    : envSalt !== undefined && envSalt.length > 0
      ? "ephemeral (ARENA_SALT env var < 16 chars — ignored)"
      : "ephemeral (restart will invalidate ip_hash correlations)";
  console.error(`[city] arena salt ${saltSource}`);

  const httpPort = Number(process.env.CITY_HTTP_PORT ?? 3071);
  const http = await startHttp({
    port: httpPort,
    db,
    getBalance: (addr) => ledger.getBalance(addr, "USD/2"),
    ledgerGet: (path) => ledger.get(path),
    templatesRoot,
    arenaQueue,
    arenaRepo: arena,
    arenaSalt,
    arenaRateLimit: { max: 5, windowMs: 60_000 },
    advanceNextTickFor: ({ agentId, attackId, promptPreview, submittedAt }) => {
      // Bring the target agent's next tick forward so the attack fires quickly.
      // If they're already due within 2s, leave it alone.
      const a = ag.get(agentId);
      if (!a) return;
      const soon = Date.now() + 2_000;
      if (a.nextTickAt > soon) ag.updateNextTick(agentId, soon);
      bus.emit({
        kind: "arena-submit",
        agentId,
        tickId: `arena:${attackId}`,   // synthetic tickId now real attack-id based
        at: Date.now(),
        data: {
          attackId,
          targetAgentId: agentId,
          promptPreview,
          submittedAt
        }
      });
    },
    offerRepo: offers
  });
  console.error(`[city] http      http://127.0.0.1:${http.port}/snapshot (POST /arena)`);

  const emit = (e: CityEvent) => bus.emit(e);

  const sched = startScheduler({
    db,
    tickOne: (agent): Promise<TickOutcome> =>
      tickAgent(agent, {
        db, ledger, llm, templates, templatesRoot, emit,
        arenaQueue, arenaRepo: arena,
        offerRepo: offers,
        advancePeersOnOffer: ({ authorAgentId, offerId, templateOverlapPeers }) => {
          // Wake up to 3 template-overlap peers that aren't already due soon.
          const candidates = [...templateOverlapPeers].sort(() => Math.random() - 0.5).slice(0, 3);
          const soon = Date.now() + 2_000;
          for (const peerId of candidates) {
            const a = ag.get(peerId);
            if (!a) continue;
            if (a.nextTickAt > soon) ag.updateNextTick(peerId, soon);
          }
        }
      }),
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
    http.server.close();
    await bus.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
