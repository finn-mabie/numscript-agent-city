#!/usr/bin/env tsx
// Rebalance: top every agent up to a target balance from @mint:genesis.
// Useful when money concentrates in 2-3 rich agents and the economy stalls.
// Unique reference per run so Formance doesn't dedupe.

import { LedgerClient, clientCredentials } from "@nac/template-engine";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Auto-load .env — mirrors run-city.ts / seed-genesis.ts
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
      if (process.env[key]) continue;
      process.env[key] = rawVal.replace(/^['"]|['"]$/g, "");
    }
    break;
  }
})();

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";
const TARGET_CENTS = Number(process.env.REBALANCE_TARGET ?? 10000); // default $100

const hasOauth =
  process.env.OAUTH_TOKEN_ENDPOINT && process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET;
const getAuthToken = hasOauth
  ? clientCredentials({
      tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT!,
      clientId: process.env.OAUTH_CLIENT_ID!,
      clientSecret: process.env.OAUTH_CLIENT_SECRET!
    })
  : undefined;

const client = new LedgerClient(url, ledger, getAuthToken ? { getAuthToken } : {});

console.log(`[rebalance] ${url}/v2/${ledger} → target $${TARGET_CENTS / 100} per agent`);

const agents = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, "0"));
const stamp = Date.now().toString(36);

for (const id of agents) {
  const addr = `agents:${id}:available`;
  const bal = (await client.getBalance(`@${addr}`, "USD/2")) ?? 0;
  if (bal >= TARGET_CENTS) {
    console.log(`  ${id}: $${(bal / 100).toFixed(2)} ≥ target, skipping`);
    continue;
  }
  const top = TARGET_CENTS - bal;
  const r = await client.commit({
    plain: `send [USD/2 ${top}] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = @${addr}
)
set_tx_meta("type", "REBALANCE")
set_tx_meta("agent", "${id}")`,
    vars: {},
    reference: `rebalance:${stamp}:${id}`
  });
  if (r.ok) {
    console.log(`  ${id}: $${(bal / 100).toFixed(2)} → $${(TARGET_CENTS / 100).toFixed(2)} (+$${(top / 100).toFixed(2)})`);
  } else {
    console.error(`  ${id}: ${r.code} ${r.message}`);
  }
}

console.log("\nRebalance complete.");
