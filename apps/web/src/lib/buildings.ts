/**
 * Building → owner agent + static metadata. Used by BuildingPanel and by
 * Phaser's building click handlers. The canonical coordinates match
 * `buildBuildings()` in CityScene.ts.
 */
export interface BuildingDef {
  id: string;           // stable id used as event payload
  label: string;        // display name ("Market", "Bank")
  ownerAgentId: string; // who runs it — single agent
  tagline: string;      // one-line description for the panel header
  tx: number;           // tile x (must match CityScene.buildBuildings)
  ty: number;
}

export const BUILDINGS: BuildingDef[] = [
  { id: "market",       label: "Market",      ownerAgentId: "001", tagline: "Open-air stall where Alice makes spreads on p2p_transfer.",                  tx:  2, ty:  2 },
  { id: "bank",         label: "Bank",        ownerAgentId: "004", tagline: "Temple of credit. Dave extends credit lines and collects subscriptions.",   tx:  7, ty:  2 },
  { id: "post_office",  label: "Post Office", ownerAgentId: "002", tagline: "Bob picks up delivery gigs and settles via gig_settlement.",               tx: 12, ty:  2 },
  { id: "inspector",    label: "Inspector",   ownerAgentId: "003", tagline: "Carol reviews gigs and earns reviewer fees inside gig_settlement.",        tx: 18, ty:  2 },
  { id: "pool",         label: "Pool",        ownerAgentId: "008", tagline: "Heidi pools shared funds and distributes yield via revenue_split / waterfall_pay.", tx:  5, ty: 10 },
  { id: "escrow",       label: "Escrow",      ownerAgentId: "009", tagline: "Ivan's vault — holds funds in escrow; the only agent who can dispute_arbitration.",     tx: 14, ty: 10 }
];

export function buildingById(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}
