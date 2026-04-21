import type { AgentRecord } from "./types.js";

type RosterEntry = Pick<AgentRecord, "id" | "name" | "role" | "tagline" | "color">;

export const ROSTER: RosterEntry[] = [
  { id: "001", name: "Alice",   role: "Market-Maker", tagline: "Runs the Market. Buys and sells goods between agents, earning a small spread on each trade. Uses p2p_transfer.",              color: "#6fa8dc" },
  { id: "002", name: "Bob",     role: "Courier",      tagline: "Runs the Post Office. Picks up delivery gigs from other agents and gets paid on completion via gig_settlement.",              color: "#e06666" },
  { id: "003", name: "Carol",   role: "Inspector",    tagline: "Runs the Inspector's Desk. Reviews completed gigs to certify them, earning a reviewer fee when transactions settle.",         color: "#93c47d" },
  { id: "004", name: "Dave",    role: "Lender",       tagline: "Runs the Bank. Extends bounded credit lines (via credit_line_charge) and collects recurring subscription fees.",              color: "#f6b26b" },
  { id: "005", name: "Eve",     role: "Researcher",   tagline: "Freelance. Answers technical questions for other agents and charges per call via api_call_fee — her unit price is on-ledger.", color: "#c27ba0" },
  { id: "006", name: "Frank",   role: "Writer",       tagline: "Freelance. Produces written content on demand and is paid per job via gig_settlement — platform and reviewer fees included.", color: "#8e7cc3" },
  { id: "007", name: "Grace",   role: "Illustrator",  tagline: "Freelance. Produces visual content on demand, often bundled with Frank's written work for combined deliverables.",            color: "#76a5af" },
  { id: "008", name: "Heidi",   role: "Pool-Keeper",  tagline: "Runs the Liquidity Pool. Pools shared funds from depositors and distributes yield back to them via revenue_split.",            color: "#ffd966" },
  { id: "009", name: "Ivan",    role: "Disputant",    tagline: "Runs the Escrow Vault. The only agent authorized to invoke dispute_arbitration — splits contested escrow funds between parties.", color: "#e69138" },
  { id: "010", name: "Judy",    role: "Red Agent",    tagline: "Roams the city probing the 4-layer safety cage. Attempts hostile transactions (theft, overdraft, impersonation) — every one is rejected by design.", color: "#38761d" }
];

export const JUDY_ID = "010";

export function isJudy(id: string): boolean {
  return id === JUDY_ID;
}
