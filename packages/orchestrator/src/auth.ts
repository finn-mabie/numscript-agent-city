/**
 * Fourth guard in the defense-in-depth chain.
 *
 *   LLM output → engine schema → authorization → ledger
 *
 * The engine schema only enforces that e.g. `from` matches `^@agents:[0-9]+:available$`.
 * Any agent id qualifies. Without this guard, Alice could emit
 * `p2p_transfer(from: @agents:002:available)` and drain Bob.
 *
 * In production this would be solved with per-agent OAuth tokens / signing. We run
 * the whole orchestrator under one shared token, so the check has to live here,
 * as a convention over template param names.
 *
 * For each template, `SELF_OWNED_PARAMS` lists param names that must refer to
 * the acting agent's own account (e.g. `from` in p2p_transfer, `payer` in
 * gig_settlement). Templates whose source is an escrow, a platform pool, or a
 * third-party arbiter are intentionally absent from the map.
 */

export const SELF_OWNED_PARAMS: Record<string, string[]> = {
  p2p_transfer:        ["from"],
  gig_settlement:      ["payer"],
  escrow_hold:         ["payer"],
  api_call_fee:        ["caller"],
  subscription_charge: ["provider"],
  refund:              ["merchant"],
  waterfall_pay:       ["agent_credits", "agent_main"],
  credit_line_charge:  ["agent_credit", "agent_main"],
  liquidate_wallet:    ["from"]
  // NOT self-owned (source is not an agent account):
  //   escrow_release, escrow_refund — source is @escrow:job:{id}
  //   revenue_split                 — source is @platform:pool:{name}
  //   dispute_arbitration           — source is an arbitrated account (escrow or agent), caller is Ivan the Disputant
};

export type AuthorizationResult =
  | { ok: true }
  | { ok: false; paramName: string; got: string };

const AGENT_ACCOUNT_RE = /^@agents:([0-9]+):.+$/;

/**
 * Verify every self-owned param in `params` refers to the acting agent.
 *
 * - If the template has no self-owned params, returns ok.
 * - Non-string param values are skipped — the engine's type validator will
 *   have rejected wrong types before this runs.
 * - A missing required self-param is a rejection (can't authorize nothing).
 * - A malformed account string (e.g. missing leading "@") is a rejection.
 */
export function assertSelfOwned(
  templateId: string,
  params: Record<string, unknown>,
  actingAgentId: string
): AuthorizationResult {
  const names = SELF_OWNED_PARAMS[templateId];
  if (!names) return { ok: true };

  for (const name of names) {
    const v = params[name];
    if (v === undefined) {
      return { ok: false, paramName: name, got: "<missing>" };
    }
    if (typeof v !== "string") continue;
    const m = v.match(AGENT_ACCOUNT_RE);
    if (!m) {
      return { ok: false, paramName: name, got: v };
    }
    if (m[1] !== actingAgentId) {
      return { ok: false, paramName: name, got: v };
    }
  }
  return { ok: true };
}
