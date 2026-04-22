import { describe, it, expect } from "vitest";
import { computeVwap, type SwapSample } from "../src/vwap.js";

describe("computeVwap", () => {
  it("returns null for empty samples", () => {
    expect(computeVwap([])).toBeNull();
  });

  it("returns the single-sample price", () => {
    const samples: SwapSample[] = [
      { quoteAmount: 500, baseAmount: 5, timestamp: 1000 }
    ];
    expect(computeVwap(samples)).toBe(100);  // $1.00 per unit
  });

  it("volume-weights across multiple samples", () => {
    const samples: SwapSample[] = [
      { quoteAmount: 500,  baseAmount: 5,  timestamp: 1000 }, // $1.00/unit, 5 units
      { quoteAmount: 3000, baseAmount: 10, timestamp: 2000 }  // $3.00/unit, 10 units
    ];
    // VWAP = (500+3000) / (5+10) = 3500 / 15 = 233.33
    expect(computeVwap(samples)).toBeCloseTo(233.33, 1);
  });

  it("skips samples with zero base amount (avoid div by zero)", () => {
    const samples: SwapSample[] = [
      { quoteAmount: 100, baseAmount: 0, timestamp: 1000 },
      { quoteAmount: 500, baseAmount: 5, timestamp: 2000 }
    ];
    expect(computeVwap(samples)).toBe(100);
  });
});
