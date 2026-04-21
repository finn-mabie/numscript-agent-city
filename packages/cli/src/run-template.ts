#!/usr/bin/env tsx
import { invoke, LedgerClient, loadTemplate } from "@nac/template-engine";
import { resolve } from "node:path";

function usage(): never {
  console.error(`Usage:
  pnpm run-template <id> --example
  pnpm run-template <id> --param <name>=<value> [--param ...]
  pnpm run-template <id> --params-json <json-string>

Values for monetary params: "USD/2:100"  (asset:minor-units)
Values for portion params:  "5%" or "1/3"
Everything else:            pass as a string.
`);
  process.exit(2);
}

function parseValue(raw: string): unknown {
  if (/^[A-Z]+\/\d+:\d+$/.test(raw)) {
    const [assetPart, amount] = raw.split(":");
    return { asset: assetPart, amount: Number(amount) };
  }
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

async function main() {
  const [, , id, ...rest] = process.argv;
  if (!id) usage();

  const rootDir = resolve(process.env.INIT_CWD ?? process.cwd(), "templates");
  const template = await loadTemplate(rootDir, id);

  let params: Record<string, unknown>;
  if (rest.includes("--example")) {
    params = template.example;
  } else if (rest.includes("--params-json")) {
    const idx = rest.indexOf("--params-json");
    params = JSON.parse(rest[idx + 1]);
  } else {
    params = {};
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--param") {
        const [k, v] = rest[i + 1].split("=", 2);
        params[k] = parseValue(v);
        i++;
      }
    }
  }

  const url = process.env.LEDGER_URL ?? "http://localhost:3068";
  const ledger = process.env.LEDGER_NAME ?? "city";
  const client = new LedgerClient(url, ledger);

  const r = await invoke({
    rootDir, templateId: id, params: params as any,
    reference: `cli-${Date.now()}`, client
  });

  if (r.ok) {
    console.log("✓ committed", r.committed?.id);
    console.log("postings:", JSON.stringify(r.dryRun?.postings, null, 2));
  } else {
    console.error(`✗ ${r.error?.phase}: ${r.error?.code} — ${r.error?.message}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
