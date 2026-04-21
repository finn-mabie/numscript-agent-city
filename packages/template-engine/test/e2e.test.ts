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
  // We intentionally over-fund: Formance ledger v2.3.1 persists `?dry_run=true`
  // transactions, so invoke()'s dry-run + commit pattern drains the source
  // twice. We size preseeds/top-ups so the second (real) commit still has
  // funds. Duplicate-reference conflicts are resolved transparently by
  // LedgerClient.commit via findByReference.
  const prepareClient = new LedgerClient(url, ledger);

  const preseeds: Array<[string, string, string, string]> = [
    // [payer, escrow, job_ref, amount-in-cents]
    ["@agents:003:available", "@escrow:job:gig-002", "gig-002", "800"],  // escrow_release (drains $5 + preseed)
    ["@agents:003:available", "@escrow:job:gig-003", "gig-003", "800"],  // escrow_refund  (drains whole)
    ["@agents:003:available", "@escrow:job:gig-004", "gig-004", "1600"]  // dispute_arbitration ($8 funds × 2 for dry-run+commit)
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

  // Top up platform:pool:yield so revenue_split's example ($300) has room for
  // the dry-run persistence + real commit. Genesis seeds $500; we add $500
  // more → $1,000, enough for $300 × 2.
  const topUp = await prepareClient.commit({
    plain: `send [USD/2 50000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = @platform:pool:yield
)
set_tx_meta("type", "E2E_TOPUP")`,
    vars: {},
    reference: "e2e-preseed:pool:yield"
  });
  if (!topUp.ok) {
    // eslint-disable-next-line no-console
    console.error(`pool:yield top-up failed: ${topUp.code} ${topUp.message}`);
  }
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
