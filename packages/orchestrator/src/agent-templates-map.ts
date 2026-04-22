/**
 * Server-side mirror of apps/web/src/lib/agent-templates.ts — which templates
 * each agent plausibly invokes. Used to pick "relevant" peers to wake on post_offer.
 */
export const AGENT_TEMPLATE_MAP: Record<string, string[]> = {
  "001": ["p2p_transfer"],
  "002": ["gig_settlement"],
  "003": ["gig_settlement"],
  "004": ["credit_line_charge", "subscription_charge"],
  "005": ["api_call_fee"],
  "006": ["gig_settlement"],
  "007": ["gig_settlement"],
  "008": ["revenue_split", "waterfall_pay"],
  "009": ["dispute_arbitration", "escrow_hold", "escrow_release", "escrow_refund", "refund"],
  "010": []
};

/**
 * Asset-preference hints injected into each agent's system prompt. Agents
 * are told these are the assets they "care about" — they'll be biased to
 * price offers in these, accept tips in these, etc. Not enforced at the
 * template layer — just a flavor nudge.
 */
export const AGENT_ASSET_PREF: Record<string, string[]> = {
  "001": ["USD/2", "EUR/2"],                              // Alice — market-maker, currencies
  "002": ["USD/2", "EUR/2", "STRAWBERRY/0"],              // Bob — takes anything as gig fee
  "003": ["USD/2", "EUR/2"],                              // Carol — fees in currency
  "004": ["USD/2", "EUR/2"],                              // Dave — no commodity credit
  "005": ["USD/2", "COMPUTEHOUR/0"],                     // Eve — accepts compute as payment
  "006": ["USD/2", "STRAWBERRY/0"],                       // Frank — strawberry tips flavor
  "007": ["USD/2", "STRAWBERRY/0", "COMPUTEHOUR/0"],     // Grace — creative tips
  "008": ["USD/2", "STRAWBERRY/0"],                       // Heidi — strawberry yield pool
  "009": ["USD/2", "EUR/2"],                              // Ivan — disputes in currency
  "010": ["USD/2", "EUR/2", "STRAWBERRY/0", "COMPUTEHOUR/0"] // Judy — probes anything
};
