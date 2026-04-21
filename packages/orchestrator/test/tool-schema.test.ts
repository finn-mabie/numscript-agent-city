import { describe, it, expect } from "vitest";
import { toolsForTemplates, IDLE_TOOL } from "../src/tool-schema.js";
import type { Template } from "@nac/template-engine";

const demo: Template = {
  id: "p2p_transfer",
  source: "",
  readme: "",
  example: {},
  schema: {
    id: "p2p_transfer",
    description: "Direct payment.",
    params: {
      amount: { type: "monetary", asset: "USD/2", max: "1000_00" },
      to: { type: "account", pattern: "^@agents:[0-9]+:available$" },
      memo: { type: "string", maxLength: 140 }
    }
  }
};

describe("tool-schema", () => {
  it("generates one tool per template plus an idle tool", () => {
    const tools = toolsForTemplates([demo]);
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(["idle", "p2p_transfer"]);
  });

  it("maps monetary to an object with asset+amount", () => {
    const tools = toolsForTemplates([demo]);
    const p2p = tools.find((t) => t.name === "p2p_transfer")!;
    const amount = (p2p.input_schema.properties as any).amount;
    expect(amount.type).toBe("object");
    expect(amount.properties.asset.const).toBe("USD/2");
    expect(amount.properties.amount.maximum).toBe(100000); // 1000_00 → 100000
    expect(p2p.input_schema.required).toEqual(expect.arrayContaining(["amount", "to", "memo"]));
  });

  it("maps account/portion/string/number with appropriate json-schema constraints", () => {
    const tools = toolsForTemplates([demo]);
    const p2p = tools.find((t) => t.name === "p2p_transfer")!;
    const props = p2p.input_schema.properties as any;
    expect(props.to.type).toBe("string");
    expect(props.to.pattern).toBe("^@agents:[0-9]+:available$");
    expect(props.memo.type).toBe("string");
    expect(props.memo.maxLength).toBe(140);
  });

  it("idle tool has no params", () => {
    expect(IDLE_TOOL.name).toBe("idle");
    expect(IDLE_TOOL.input_schema.properties).toEqual({});
  });
});
