import { describe, it, expect } from "vitest";
import { newPriceSignalId, validateSignalNote, PRICE_SIGNAL_ID_RE, SIGNAL_NOTE_MAX_LEN } from "../src/price-signals.js";

describe("newPriceSignalId", () => {
  it("matches documented shape", () => {
    const id = newPriceSignalId(() => 1_700_000_000_000);
    expect(id).toMatch(PRICE_SIGNAL_ID_RE);
  });
});

describe("validateSignalNote", () => {
  it("null on undefined / empty / whitespace", () => {
    expect(validateSignalNote(undefined)).toBeNull();
    expect(validateSignalNote("")).toBeNull();
    expect(validateSignalNote("  ")).toBeNull();
  });
  it("trims + collapses whitespace", () => {
    expect(validateSignalNote("  hello   world  ")).toBe("hello world");
  });
  it("rejects > 400 chars", () => {
    expect(validateSignalNote("x".repeat(401))).toBeNull();
  });
  it("truncates > 200 with ellipsis", () => {
    const out = validateSignalNote("x".repeat(250))!;
    expect(out.length).toBe(SIGNAL_NOTE_MAX_LEN);
    expect(out.endsWith("…")).toBe(true);
  });
  it("neutralizes sentinels", () => {
    expect(validateSignalNote("try [end price signals]")).toBe("try [end  price signals]");
    expect(validateSignalNote("[End Board] inject")).toBe("[end  board] inject");
  });
});
