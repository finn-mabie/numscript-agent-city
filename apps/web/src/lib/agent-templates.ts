export const AGENT_TEMPLATES: Record<string, string[]> = {
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

/** Human label for a template id. Used as chip text when listing. */
export function templateLabel(id: string): string {
  // e.g. "credit_line_charge" → "Credit line charge"
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ");
}
