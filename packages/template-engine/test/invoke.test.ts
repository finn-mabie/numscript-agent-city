import { describe, it, expect, beforeAll, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { invoke } from "../src/invoke.js";
import { LedgerClient } from "../src/ledger-client.js";

const FIX = join(__dirname, "__fixtures__/invoke-templates");
const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

beforeAll(async () => {
  rmSync(FIX, { recursive: true, force: true });
  mkdirSync(join(FIX, "smoke"), { recursive: true });
  writeFileSync(join(FIX, "smoke/template.num"),
`vars {
  monetary $amount
  account $to
}
send $amount (
  source = @mint:genesis allowing unbounded overdraft
  destination = $to
)
set_tx_meta("type", "SMOKE")`);
  writeFileSync(join(FIX, "smoke/schema.json"), JSON.stringify({
    id: "smoke",
    description: "smoke",
    params: {
      amount: { type: "monetary", asset: "USD/2", max: "1000_00" },
      to: { type: "account", pattern: "^@.+" }
    }
  }));
  writeFileSync(join(FIX, "smoke/example.json"), JSON.stringify({
    amount: { asset: "USD/2", amount: 100 },
    to: "@test:invoke"
  }));
  writeFileSync(join(FIX, "smoke/README.md"), "# smoke\n");
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
});

describe("invoke", () => {
  const client = new LedgerClient(url, ledger);

  it("end-to-end: loads, validates, renders, dry-runs, commits", async () => {
    const r = await invoke({
      rootDir: FIX,
      templateId: "smoke",
      params: { amount: { asset: "USD/2", amount: 100 }, to: "@test:invoke" },
      reference: `smoke-${Date.now()}`,
      client
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.committed?.id).toBeTruthy();
      expect(r.dryRun?.postings).toHaveLength(1);
      expect(r.dryRun?.postings[0].amount).toBe(100);
    }
  });

  it("rejects at validate phase when param exceeds schema max", async () => {
    const r = await invoke({
      rootDir: FIX,
      templateId: "smoke",
      params: { amount: { asset: "USD/2", amount: 999999999 }, to: "@test:invoke" },
      reference: `bad-${Date.now()}`,
      client
    });
    expect(r.ok).toBe(false);
    expect(r.error?.phase).toBe("validate");
    expect(r.error?.code).toBe("BoundsError");
  });

  // ── Phase-order invariant ────────────────────────────────────────────────
  // This is load-bearing: the entire safety story says "no posting reaches
  // the ledger when validation rejects." If this test ever starts passing
  // without a proper early-return, the safety claim is compromised.
  it("never calls the ledger when validation rejects (phase-order invariant)", async () => {
    const dryRunSpy = vi.spyOn(client, "dryRun");
    const commitSpy = vi.spyOn(client, "commit");
    try {
      const r = await invoke({
        rootDir: FIX,
        templateId: "smoke",
        params: { amount: { asset: "USD/2", amount: 999999999 }, to: "@test:invoke" },
        reference: `phase-${Date.now()}`,
        client
      });
      expect(r.ok).toBe(false);
      expect(dryRunSpy).not.toHaveBeenCalled();
      expect(commitSpy).not.toHaveBeenCalled();
    } finally {
      dryRunSpy.mockRestore();
      commitSpy.mockRestore();
    }
  });

  it("mode 'dry-run' calls only dryRun (no commit, no state written)", async () => {
    const dryRunSpy = vi.spyOn(client, "dryRun");
    const commitSpy = vi.spyOn(client, "commit");
    try {
      const r = await invoke({
        rootDir: FIX,
        templateId: "smoke",
        params: { amount: { asset: "USD/2", amount: 50 }, to: "@test:preview-only" },
        reference: `dryonly-${Date.now()}`,
        client,
        mode: "dry-run"
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.dryRun?.postings).toHaveLength(1);
        expect(r.committed).toBeUndefined();
      }
      expect(dryRunSpy).toHaveBeenCalledTimes(1);
      expect(commitSpy).not.toHaveBeenCalled();
    } finally {
      dryRunSpy.mockRestore();
      commitSpy.mockRestore();
    }
  });

  it("default mode 'commit' skips the dry-run call (single ledger write)", async () => {
    const dryRunSpy = vi.spyOn(client, "dryRun");
    const commitSpy = vi.spyOn(client, "commit");
    try {
      const r = await invoke({
        rootDir: FIX,
        templateId: "smoke",
        params: { amount: { asset: "USD/2", amount: 50 }, to: "@test:single-write" },
        reference: `single-${Date.now()}`,
        client
      });
      expect(r.ok).toBe(true);
      expect(dryRunSpy).not.toHaveBeenCalled();
      expect(commitSpy).toHaveBeenCalledTimes(1);
    } finally {
      dryRunSpy.mockRestore();
      commitSpy.mockRestore();
    }
  });
});
