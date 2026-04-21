import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { invoke, LedgerClient, loadTemplates } from "../src/index.js";

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

const repoRoot = resolve(__dirname, "../../../");
const templatesRoot = resolve(repoRoot, "templates");

// Synchronously enumerate template ids so it.each has a concrete array at
// collection time. (vitest's it.each does not await async factories.)
const templateIds = readdirSync(templatesRoot)
  .filter((name) => statSync(resolve(templatesRoot, name)).isDirectory())
  .sort();

beforeAll(async () => {
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
  // Run genesis seeding once so balances exist
  execSync("pnpm seed-genesis", { cwd: repoRoot, stdio: "inherit" });

  // Pre-fund escrow accounts that escrow_release, escrow_refund, and
  // dispute_arbitration examples rely on. Genesis does not seed escrow
  // accounts — they are only populated by runtime escrow_hold calls.
  //
  // Since Patch 3, invoke() defaults to mode "commit" (single ledger write),
  // so preseeds are sized to exactly what each template's example drains.
  const prepareClient = new LedgerClient(url, ledger);

  const preseeds: Array<[string, string, string, string]> = [
    // [payer, escrow, job_ref, amount-in-cents]
    ["@agents:003:available", "@escrow:job:gig-002", "gig-002", "500"],  // escrow_release
    ["@agents:003:available", "@escrow:job:gig-003", "gig-003", "500"],  // escrow_refund
    ["@agents:003:available", "@escrow:job:gig-004", "gig-004", "800"]   // dispute_arbitration ($8 funds)
  ];
  for (const [payer, escrow, jobRef, cents] of preseeds) {
    const r = await prepareClient.commit({
      plain: `vars {
  monetary $amount
  account $payer
  account $escrow
  string $job_ref
}
send $amount (
  source      = $payer
  destination = $escrow
)
set_tx_meta("type",    "ESCROW_HOLD")
set_tx_meta("job_ref", $job_ref)
set_tx_meta("payer",   $payer)`,
      vars: {
        amount: `USD/2 ${cents}`,
        payer: payer.replace(/^@/, ""),
        escrow: escrow.replace(/^@/, ""),
        job_ref: jobRef
      },
      reference: `e2e-preseed:${escrow}`
    });
    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.error(`preseed failed for ${escrow}: ${r.code} ${r.message}`);
    }
  }

  // Genesis already seeds @platform:pool:yield with $500, which is exactly
  // what revenue_split's example ($300 + 2 recipients split) needs. No top-up.
}, 120_000);

describe("E2E — every template runs with its example.json on a seeded ledger", () => {
  const client = new LedgerClient(url, ledger);

  it.each(templateIds)("%s", async (id: string) => {
    const all = await loadTemplates(templatesRoot);
    const t = all.find((x) => x.id === id)!;
    const r = await invoke({
      rootDir: templatesRoot,
      templateId: id,
      params: t.example as any,
      reference: `e2e:${id}:${Date.now()}`,
      client
    });
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    if (r.ok) expect(r.committed?.id).toBeTruthy();
  });
});
