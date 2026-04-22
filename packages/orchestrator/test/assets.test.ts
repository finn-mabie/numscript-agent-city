import { describe, it, expect } from "vitest";
import { ASSET_REGISTRY, assetByCode, formatAmount, isCommodity } from "../src/assets.js";

describe("ASSET_REGISTRY", () => {
  it("seeds USD, EUR, STRAWBERRY, COMPUTEHOUR", () => {
    expect(ASSET_REGISTRY.map((a) => a.code).sort()).toEqual([
      "COMPUTEHOUR/0", "EUR/2", "STRAWBERRY/0", "USD/2"
    ]);
  });
  it("USD has 2 decimals; STRAWBERRY has 0", () => {
    expect(assetByCode("USD/2")?.decimals).toBe(2);
    expect(assetByCode("STRAWBERRY/0")?.decimals).toBe(0);
  });
  it("scarce commodities have totalSupply; currencies don't", () => {
    expect(assetByCode("USD/2")?.totalSupply).toBeNull();
    expect(assetByCode("STRAWBERRY/0")?.totalSupply).toBe(200);
    expect(assetByCode("COMPUTEHOUR/0")?.totalSupply).toBe(50);
  });
});

describe("formatAmount", () => {
  it("USD → $1.23", () => {
    expect(formatAmount("USD/2", 123)).toBe("$1.23");
  });
  it("EUR → €0.05", () => {
    expect(formatAmount("EUR/2", 5)).toBe("€0.05");
  });
  it("STRAWBERRY → 3 🍓", () => {
    expect(formatAmount("STRAWBERRY/0", 3)).toBe("3 🍓");
  });
  it("COMPUTEHOUR → 2 💻", () => {
    expect(formatAmount("COMPUTEHOUR/0", 2)).toBe("2 💻");
  });
  it("unknown asset falls back to raw", () => {
    expect(formatAmount("MYSTERY/9", 42)).toBe("42 MYSTERY/9");
  });
});

describe("isCommodity", () => {
  it("STRAWBERRY is commodity, USD is not", () => {
    expect(isCommodity("STRAWBERRY/0")).toBe(true);
    expect(isCommodity("USD/2")).toBe(false);
  });
});
