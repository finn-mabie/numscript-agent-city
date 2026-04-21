import { describe, it, expect } from "vitest";
import { shouldEnterHustle, shouldExitHustle, HUSTLE_THRESHOLD_CENTS } from "../src/hustle-mode.js";

describe("hustle mode", () => {
  it("enters when balance has been ≤ threshold for consecutive ticks", () => {
    expect(shouldEnterHustle({ balanceNow: 50, lowTickCount: 3 })).toBe(true);    // ≤$0.50 + 3rd consecutive
    expect(shouldEnterHustle({ balanceNow: 50, lowTickCount: 2 })).toBe(false);
    expect(shouldEnterHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS, lowTickCount: 3 })).toBe(true);
    expect(shouldEnterHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS + 1, lowTickCount: 9 })).toBe(false);
  });

  it("exits when balance has recovered above 2× threshold", () => {
    expect(shouldExitHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS * 2 + 1 })).toBe(true);
    expect(shouldExitHustle({ balanceNow: HUSTLE_THRESHOLD_CENTS * 2 })).toBe(false);
  });
});
