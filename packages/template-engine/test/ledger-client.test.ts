import { describe, it, expect, beforeAll } from "vitest";
import { LedgerClient } from "../src/ledger-client.js";

const url = process.env.LEDGER_URL ?? "http://localhost:3068";
const ledger = process.env.LEDGER_NAME ?? "city";

// Create ledger if missing
beforeAll(async () => {
  await fetch(`${url}/v2/${ledger}`, { method: "POST" });
});

describe("LedgerClient (integration)", () => {
  const client = new LedgerClient(url, ledger);

  it("dry-runs a simple script and returns postings without writing", async () => {
    const r = await client.dryRun({
      plain: `send [USD/2 100] (
  source = @mint:genesis allowing unbounded overdraft
  destination = @test:one
)`,
      vars: {}
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.postings.length).toBe(1);
      expect(r.postings[0].amount).toBe(100);
    }
  });

  it("commits a script and returns a tx id", async () => {
    const ref = `test-${Date.now()}`;
    const r = await client.commit({
      plain: `send [USD/2 100] (
  source = @mint:genesis allowing unbounded overdraft
  destination = @test:two
)`,
      vars: {},
      reference: ref
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tx.id).toBeTruthy();
  });

  it("is idempotent on same reference (second commit returns existing tx)", async () => {
    const ref = `test-idem-${Date.now()}`;
    const script = {
      plain: `send [USD/2 50] (
  source = @mint:genesis allowing unbounded overdraft
  destination = @test:idem
)`,
      vars: {},
      reference: ref
    };
    const a = await client.commit(script);
    const b = await client.commit(script);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.tx.id).toBe(b.tx.id);
  });

  it("surfaces MissingFundsErr on overdraft", async () => {
    const r = await client.dryRun({
      plain: `send [USD/2 100] (
  source = @nowhere
  destination = @test:three
)`,
      vars: {}
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toMatch(/INSUFFICIENT|MISSING/i);
  });

  it("injects Authorization: Bearer <token> when getAuthToken is supplied", async () => {
    let captured: string | null = null;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (req: any, init: any) => {
      captured = init?.headers?.["Authorization"] ?? null;
      // Fall through to the real ledger so the request still completes.
      return realFetch(req, init);
    }) as typeof fetch;
    try {
      const authedClient = new LedgerClient(url, ledger, {
        getAuthToken: async () => "sentinel-token"
      });
      await authedClient.dryRun({
        plain: `send [USD/2 1] (
  source = @mint:genesis allowing unbounded overdraft
  destination = @test:auth
)`,
        vars: {}
      });
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(captured).toBe("Bearer sentinel-token");
  });
});
