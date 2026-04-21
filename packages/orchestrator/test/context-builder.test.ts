import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context-builder.js";
import type { AgentRecord, Relationship, IntentLogEntry } from "../src/types.js";

const agent: AgentRecord = {
  id: "001", name: "Alice", role: "Market-Maker",
  tagline: "Find small spreads, move volume, stay neutral.",
  color: "#0000ff", nextTickAt: 0, hustleMode: 0,
  createdAt: 0, updatedAt: 0
};
const peers: AgentRecord[] = [
  { ...agent, id: "002", name: "Bob", role: "Courier", tagline: "", color: "" },
  { ...agent, id: "003", name: "Carol", role: "Inspector", tagline: "", color: "" }
];
const balances: Record<string, number> = {
  "@agents:001:available": 10000, "@agents:002:available": 8000, "@agents:003:available": 500
};
const topRel: Relationship[] = [
  { agentId: "001", peerId: "002", trust: 0.6, lastInteractionAt: 0 }
];
const bottomRel: Relationship[] = [
  { agentId: "001", peerId: "003", trust: -0.4, lastInteractionAt: 0 }
];
const recent: IntentLogEntry[] = [
  { agentId: "001", tickId: "001:1", reasoning: "paid bob", templateId: "p2p_transfer", params: null, outcome: "committed", errorPhase: null, errorCode: null, txId: "42", createdAt: 1 }
];

describe("buildContext", () => {
  it("embeds identity, balance, roster, relationships, events", () => {
    const { system, user } = buildContext({ agent, peers, balances, topRel, bottomRel, recent });
    expect(system).toContain("Alice");
    expect(system).toContain("Market-Maker");
    expect(user).toContain("$100.00"); // 10000 minor units → $100.00
    expect(user).toContain("Bob");
    expect(user).toContain("Carol");
    expect(user).toContain("trust +0.60"); // top relationship
    expect(user).toContain("trust -0.40"); // bottom
    expect(user).toContain("paid bob");
    expect(user).toContain("p2p_transfer");
  });

  it("includes hustle-mode line when the agent is broke", () => {
    const broke = { ...agent, hustleMode: 1 as const };
    const { system } = buildContext({ agent: broke, peers, balances, topRel, bottomRel, recent });
    expect(system.toLowerCase()).toContain("nearly broke");
  });
});
