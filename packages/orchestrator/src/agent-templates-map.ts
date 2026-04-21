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
