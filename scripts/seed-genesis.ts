#!/usr/bin/env tsx
import { LedgerClient, clientCredentials } from "@nac/template-engine";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Auto-load .env from the repo root (walks up from cwd). Mirrors run-city.ts.
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
      if (process.env[key]) continue; // shell non-empty wins
      process.env[key] = rawVal.replace(/^['"]|['"]$/g, "");
    }
    break;
  }
})();

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

const hasOauth =
  process.env.OAUTH_TOKEN_ENDPOINT && process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET;
const getAuthToken = hasOauth
  ? clientCredentials({
      tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT!,
      clientId: process.env.OAUTH_CLIENT_ID!,
      clientSecret: process.env.OAUTH_CLIENT_SECRET!
    })
  : undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (getAuthToken) h["Authorization"] = `Bearer ${await getAuthToken()}`;
  return h;
}

const client = new LedgerClient(url, ledger, getAuthToken ? { getAuthToken } : {});

console.log(`[seed] ${url}/v2/${ledger} ${hasOauth ? "(OAuth2)" : "(no auth)"}`);

// Ensure ledger exists (no-op if it already does — Formance returns 400/409 on duplicate)
await fetch(`${url}/v2/${ledger}`, { method: "POST", headers: await authHeaders() });

const agents = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, "0"));
const agentAvailable = (id: string) => `@agents:${id}:available`;

// Seed each agent with $100
for (const id of agents) {
  const ref = `genesis:agents:${id}:available`;
  const r = await client.commit({
    plain: `send [USD/2 10000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = ${agentAvailable(id)}
)
set_tx_meta("type", "GENESIS_SEED")
set_tx_meta("agent", "${id}")`,
    vars: {},
    reference: ref
  });
  if (!r.ok) console.error(`seed ${id}: ${r.code} ${r.message}`);
  else console.log(`✓ seeded agent ${id}`);
}

// Platform treasury $1,200
{
  const r = await client.commit({
    plain: `send [USD/2 120000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = @platform:treasury:main
)
set_tx_meta("type", "GENESIS_SEED")
set_tx_meta("account", "platform:treasury:main")`,
    vars: {},
    reference: "genesis:platform:treasury"
  });
  if (r.ok) console.log("✓ seeded platform:treasury:main");
  else console.error(`treasury: ${r.code} ${r.message}`);
}

// Set unit_price on each agent (so api_call_fee has a price to read)
// Unit price: agents with odd id → $0.02, even → $0.05
for (const id of agents) {
  const price = Number(id) % 2 === 0 ? 5 : 2;
  const res = await fetch(
    `${url}/v2/${ledger}/accounts/agents:${id}:available/metadata`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        unit_price: `USD/2 ${price}`
      })
    }
  );
  if (!res.ok) console.error(`meta ${id}: HTTP ${res.status}`);
  else console.log(`✓ set unit_price=${price}¢ on agent ${id}`);
}

// Seed the yield pool with $500 (for revenue_split demonstrations)
{
  const r = await client.commit({
    plain: `send [USD/2 50000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = @platform:pool:yield
)
set_tx_meta("type", "GENESIS_SEED")`,
    vars: {},
    reference: "genesis:pool:yield"
  });
  if (r.ok) console.log("✓ seeded platform:pool:yield");
  else console.error(`yield pool: ${r.code} ${r.message}`);
}

// Seed the liquidity pool — Heidi's LLM naturally names this pool, so we seed
// it alongside yield to match her mental model and enable live revenue_split calls.
{
  const r = await client.commit({
    plain: `send [USD/2 50000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = @platform:pool:liquidity-main
)
set_tx_meta("type", "GENESIS_SEED")`,
    vars: {},
    reference: "genesis:pool:liquidity-main"
  });
  if (r.ok) console.log("✓ seeded platform:pool:liquidity-main");
  else console.error(`liquidity pool: ${r.code} ${r.message}`);
}

console.log("\nGenesis complete.");
