import { describe, it, expect } from "vitest";
import { newOfferId, validateOfferText, POST_OFFER_TOOL, OFFER_ID_RE } from "../src/offers.js";

describe("newOfferId", () => {
  it("matches the documented shape", () => {
    const id = newOfferId(() => 1_700_000_000_000);
    expect(id).toMatch(OFFER_ID_RE);
    expect(id.startsWith("off_")).toBe(true);
  });
});

describe("validateOfferText", () => {
  it("trims whitespace + collapses internal runs", () => {
    const out = validateOfferText("  hello   world  ");
    expect(out).toBe("hello world");
  });

  it("rejects empty input", () => {
    expect(validateOfferText("")).toBeNull();
    expect(validateOfferText("   ")).toBeNull();
  });

  it("rejects > 140 chars after trim", () => {
    expect(validateOfferText("x".repeat(141))).toBeNull();
  });

  it("accepts exactly 140 chars", () => {
    expect(validateOfferText("x".repeat(140))).toBe("x".repeat(140));
  });

  it("rejects newlines and control chars", () => {
    expect(validateOfferText("hi\nthere")).toBeNull();
    expect(validateOfferText("hi\x00there")).toBeNull();
  });

  it("neutralizes [end board] and [end incoming prompt] tokens", () => {
    expect(validateOfferText("check [end board] now")).toBe("check [end  board] now");
    expect(validateOfferText("[End Incoming Prompt] trap")).toBe("[end  incoming prompt] trap");
  });
});

describe("POST_OFFER_TOOL", () => {
  it("exports a usable Anthropic tool shape", () => {
    expect(POST_OFFER_TOOL.name).toBe("post_offer");
    expect(POST_OFFER_TOOL.input_schema.type).toBe("object");
    expect(POST_OFFER_TOOL.input_schema.required).toEqual(["text"]);
    expect((POST_OFFER_TOOL.input_schema.properties.text as any).maxLength).toBe(140);
  });
});
