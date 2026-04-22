import { describe, it, expect } from "vitest";
import { AGENT_TEMPLATE_MAP, AGENT_ASSET_PREF } from "../src/agent-templates-map.js";

describe("AGENT_ASSET_PREF", () => {
  it("every agent has at least one preferred asset", () => {
    for (const id of Object.keys(AGENT_TEMPLATE_MAP)) {
      expect(AGENT_ASSET_PREF[id]).toBeTruthy();
      expect(AGENT_ASSET_PREF[id].length).toBeGreaterThan(0);
    }
  });
  it("Alice prefers currencies only", () => {
    expect(AGENT_ASSET_PREF["001"]).toEqual(["USD/2", "EUR/2"]);
  });
  it("Grace accepts STRAWBERRY + COMPUTEHOUR (creative-tips flavor)", () => {
    expect(AGENT_ASSET_PREF["007"]).toContain("STRAWBERRY/0");
    expect(AGENT_ASSET_PREF["007"]).toContain("COMPUTEHOUR/0");
  });
  it("Dave is USD/EUR only — no commodity credit", () => {
    expect(AGENT_ASSET_PREF["004"]).toEqual(["USD/2", "EUR/2"]);
  });
});
