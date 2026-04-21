import { describe, it, expect } from "vitest";
import { validateParams } from "../src/validator.js";
import type { TemplateSchema } from "../src/types.js";

const schema: TemplateSchema = {
  id: "t",
  description: "test",
  params: {
    amount: { type: "monetary", asset: "USD/2", max: "1000_00" },
    from: { type: "account", pattern: "^@agents:.+$" },
    fee: { type: "portion", max: "20%" }
  }
};

describe("validator", () => {
  it("accepts valid params", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 500 },
      from: "@agents:alice",
      fee: "5%"
    });
    expect(r.ok).toBe(true);
  });

  it("rejects monetary over max", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 999999999 },
      from: "@agents:alice",
      fee: "5%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("BoundsError");
  });

  it("rejects monetary with wrong asset", () => {
    const r = validateParams(schema, {
      amount: { asset: "EUR/2", amount: 100 },
      from: "@agents:alice",
      fee: "5%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("AssetMismatch");
  });

  it("rejects account not matching pattern", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 100 },
      from: "@platform:treasury:main",
      fee: "5%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("PatternMismatch");
  });

  it("rejects portion over max", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 100 },
      from: "@agents:alice",
      fee: "99%"
    });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("BoundsError");
  });

  it("rejects missing required param", () => {
    const r = validateParams(schema, {
      amount: { asset: "USD/2", amount: 100 }
    } as never);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("MissingParam");
  });
});
