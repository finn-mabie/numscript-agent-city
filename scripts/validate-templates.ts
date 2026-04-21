#!/usr/bin/env tsx
import { loadTemplates } from "@nac/template-engine";
import { renderVars } from "@nac/template-engine";
import { validateParams } from "@nac/template-engine";
import { resolve } from "node:path";

const PG = "https://numscript-playground-api-prod.fly.dev/run";

type Balance = { [account: string]: { [asset: string]: number } };

// Seed balances large enough for any example to succeed.
function seedBalances(vars: Record<string, string>): Balance {
  const b: Balance = {};
  for (const v of Object.values(vars)) {
    // Take account-like strings from vars and seed them $10,000 USD/2
    if (/^[a-zA-Z0-9_-]+(:[a-zA-Z0-9_-]+)+$/.test(v)) {
      b[v] = { "USD/2": 1_000_000 };
    }
  }
  // Always seed genesis
  b["mint:genesis"] = { "USD/2": 100_000_000_000 };
  return b;
}

function seedMetadata(vars: Record<string, string>): Record<string, Record<string, string>> {
  // The Playground API expects metadata values as strings (Numscript serialized form).
  // For api_call_fee we need a unit_price on the provider.
  const md: Record<string, Record<string, string>> = {};
  for (const v of Object.values(vars)) {
    if (/^agents:[0-9]+:available$/.test(v)) {
      md[v] = { unit_price: "USD/2 2" };
    }
  }
  return md;
}

async function main() {
  const rootDir = resolve(process.cwd(), "templates");
  const templates = await loadTemplates(rootDir);
  let failed = 0;

  for (const t of templates) {
    const vcheck = validateParams(t.schema, t.example as any);
    if (!vcheck.ok) {
      console.error(`✗ ${t.id}: example fails schema validation — ${vcheck.error.message}`);
      failed++;
      continue;
    }

    const vars = renderVars(t.schema, t.example as any);
    const payload = {
      script: t.source,
      balances: seedBalances(vars),
      metadata: seedMetadata(vars),
      variables: vars,
      featureFlags: [
        "experimental-yield-distribution",
        "experimental-account-interpolation",
        "experimental-mid-script-function-call"
      ]
    };

    const res = await fetch(PG, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const rawText = await res.text();
    let body: any = {};
    try { body = JSON.parse(rawText); } catch { /* keep empty */ }
    if (!res.ok || !body.ok) {
      console.error(`✗ ${t.id}: ${body.error ?? `HTTP ${res.status} — ${rawText}`}`);
      failed++;
      continue;
    }
    console.log(`✓ ${t.id} (${body.value.postings.length} postings)`);
  }

  if (failed) {
    console.error(`\n${failed} template(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll ${templates.length} templates validated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
