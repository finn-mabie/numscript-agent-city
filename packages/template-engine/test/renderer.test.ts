import { describe, it, expect } from "vitest";
import { renderVars } from "../src/renderer.js";
import type { TemplateSchema } from "../src/types.js";

const schema: TemplateSchema = {
  id: "t",
  description: "t",
  params: {
    amount: { type: "monetary", asset: "USD/2" },
    from: { type: "account" },
    fee: { type: "portion" },
    note: { type: "string" },
    n: { type: "number" }
  }
};

describe("renderVars", () => {
  it("renders monetary as 'USD/2 100' wire format", () => {
    const v = renderVars(schema, {
      amount: { asset: "USD/2", amount: 100 },
      from: "@agents:alice",
      fee: "5%",
      note: "hello",
      n: 42
    });
    expect(v).toEqual({
      amount: "USD/2 100",
      from: "agents:alice",    // leading @ stripped for wire format
      fee: "5%",
      note: "hello",
      n: "42"
    });
  });

  it("throws when an account param is missing its leading @", () => {
    const s: TemplateSchema = { id: "t", description: "t", params: { a: { type: "account" } } };
    expect(() => renderVars(s, { a: "agents:001:available" })).toThrow(/leading "@"/);
  });
});
