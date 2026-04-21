import { describe, it, expect } from "vitest";
import { assertSelfOwned, SELF_OWNED_PARAMS } from "../src/auth.js";

describe("assertSelfOwned", () => {
  it("accepts a template with no self-owned params", () => {
    // revenue_split moves from a platform pool — no self-owned params.
    const r = assertSelfOwned("revenue_split", { pool: "@platform:pool:yield" }, "001");
    expect(r.ok).toBe(true);
  });

  it("accepts when the self-owned param points at the acting agent", () => {
    const r = assertSelfOwned("p2p_transfer",
      { from: "@agents:001:available", to: "@agents:002:available" },
      "001"
    );
    expect(r.ok).toBe(true);
  });

  it("rejects when the self-owned param points at a different agent", () => {
    const r = assertSelfOwned("p2p_transfer",
      { from: "@agents:002:available", to: "@agents:001:available" },
      "001"
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.paramName).toBe("from");
      expect(r.got).toBe("@agents:002:available");
    }
  });

  it("rejects when the self-owned param is a malformed account string", () => {
    const r = assertSelfOwned("p2p_transfer",
      { from: "agents:001:available", to: "@agents:002:available" },  // missing @
      "001"
    );
    expect(r.ok).toBe(false);
  });

  it("rejects when the self-owned param is missing entirely", () => {
    const r = assertSelfOwned("p2p_transfer",
      { to: "@agents:002:available" },
      "001"
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.paramName).toBe("from");
  });

  it("ignores non-string self-owned params (typed as number/object etc.)", () => {
    // Defensive: if the caller somehow passes non-string, the check skips silently.
    // The template engine's validator will reject the wrong type before this runs.
    const r = assertSelfOwned("p2p_transfer",
      { from: 42, to: "@agents:002:available" },
      "001"
    );
    expect(r.ok).toBe(true);  // not this layer's job to complain
  });

  it("checks ALL self-owned params for templates that have multiple", () => {
    // waterfall_pay has two self-owned params: agent_credits + agent_main
    const good = assertSelfOwned("waterfall_pay",
      {
        agent_credits: "@agents:002:credits",
        agent_main: "@agents:002:available",
        to: "@agents:005:available"
      },
      "002"
    );
    expect(good.ok).toBe(true);

    const bad = assertSelfOwned("waterfall_pay",
      {
        agent_credits: "@agents:002:credits",
        agent_main: "@agents:003:available",   // Bob's main, not Alice's
        to: "@agents:005:available"
      },
      "002"
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.paramName).toBe("agent_main");
  });

  it("unknown template id has no self-owned params (defaults to allow)", () => {
    const r = assertSelfOwned("some_future_template", { anything: "@agents:001:available" }, "001");
    expect(r.ok).toBe(true);
  });

  it("exports the SELF_OWNED_PARAMS map covering all money-moving-from-self templates", () => {
    // Sanity check: all templates whose source is an agent account have an entry.
    expect(SELF_OWNED_PARAMS.p2p_transfer).toEqual(["from"]);
    expect(SELF_OWNED_PARAMS.gig_settlement).toEqual(["payer"]);
    expect(SELF_OWNED_PARAMS.escrow_hold).toEqual(["payer"]);
    expect(SELF_OWNED_PARAMS.api_call_fee).toEqual(["caller"]);
    expect(SELF_OWNED_PARAMS.subscription_charge).toEqual(["provider"]);
    expect(SELF_OWNED_PARAMS.refund).toEqual(["merchant"]);
    expect(SELF_OWNED_PARAMS.waterfall_pay).toEqual(["agent_credits", "agent_main"]);
    expect(SELF_OWNED_PARAMS.credit_line_charge).toEqual(["agent_credit", "agent_main"]);
    expect(SELF_OWNED_PARAMS.liquidate_wallet).toEqual(["from"]);
    // Templates without agent-source: revenue_split, escrow_release, escrow_refund, dispute_arbitration
    // → should NOT appear in the map.
    expect(SELF_OWNED_PARAMS.revenue_split).toBeUndefined();
    expect(SELF_OWNED_PARAMS.escrow_release).toBeUndefined();
    expect(SELF_OWNED_PARAMS.escrow_refund).toBeUndefined();
    expect(SELF_OWNED_PARAMS.dispute_arbitration).toBeUndefined();
  });
});
