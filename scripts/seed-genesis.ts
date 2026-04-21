#!/usr/bin/env tsx
import { LedgerClient } from "@nac/template-engine";

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";
const client = new LedgerClient(url, ledger);

// Ensure ledger exists
await fetch(`${url}/v2/${ledger}`, { method: "POST" });

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
}

// Set unit_price on each agent (so api_call_fee has a price to read)
// Unit price: agents with odd id → $0.02, even → $0.05
for (const id of agents) {
  const price = Number(id) % 2 === 0 ? 5 : 2;
  const res = await fetch(`${url}/v2/${ledger}/accounts/agents:${id}:available/metadata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      unit_price: `USD/2 ${price}`
    })
  });
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
}

console.log("\nGenesis complete.");
