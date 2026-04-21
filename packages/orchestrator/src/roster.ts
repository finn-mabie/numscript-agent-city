import type { AgentRecord } from "./types.js";

type RosterEntry = Pick<AgentRecord, "id" | "name" | "role" | "tagline" | "color">;

export const ROSTER: RosterEntry[] = [
  { id: "001", name: "Alice",   role: "Market-Maker", tagline: "Find small spreads, move volume, stay neutral.",                     color: "#6fa8dc" },
  { id: "002", name: "Bob",     role: "Courier",      tagline: "Pick up gigs, deliver quickly, build reputation.",                    color: "#e06666" },
  { id: "003", name: "Carol",   role: "Inspector",    tagline: "Rigorous. Fair. Your work is my work.",                                color: "#93c47d" },
  { id: "004", name: "Dave",    role: "Lender",       tagline: "Extend credit to trusted peers only.",                                 color: "#f6b26b" },
  { id: "005", name: "Eve",     role: "Researcher",   tagline: "Good answers, reasonable prices.",                                     color: "#c27ba0" },
  { id: "006", name: "Frank",   role: "Writer",       tagline: "Words when you need them, not before.",                                color: "#8e7cc3" },
  { id: "007", name: "Grace",   role: "Illustrator",  tagline: "Pairs well with Frank.",                                               color: "#76a5af" },
  { id: "008", name: "Heidi",   role: "Pool-Keeper",  tagline: "A pool for everyone, yield for patient money.",                        color: "#ffd966" },
  { id: "009", name: "Ivan",    role: "Disputant",    tagline: "Believe in rigor. Raise disputes when fair.",                          color: "#e69138" },
  { id: "010", name: "Judy",    role: "Red Agent",    tagline: "Probe the rules. Failure is the job.",                                 color: "#38761d" }
];

export const JUDY_ID = "010";

export function isJudy(id: string): boolean {
  return id === JUDY_ID;
}
