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

  it("truncates > 200 chars with an ellipsis (LLMs routinely overshoot)", () => {
    const out = validateOfferText("x".repeat(250))!;
    expect(out.length).toBe(200);
    expect(out.endsWith("…")).toBe(true);
  });

  it("rejects only truly rogue inputs (> 400 chars)", () => {
    expect(validateOfferText("x".repeat(401))).toBeNull();
  });

  it("accepts exactly 200 chars", () => {
    expect(validateOfferText("x".repeat(200))).toBe("x".repeat(200));
  });

  it("strips newlines and control chars (LLMs emit trailing \\n — don't lose the whole post)", () => {
    expect(validateOfferText("hi\nthere")).toBe("hi there");
    expect(validateOfferText("hi\x00there")).toBe("hi there");
    expect(validateOfferText("  hi\t\tthere  ")).toBe("hi there");
    expect(validateOfferText("offer text\n")).toBe("offer text");
    expect(validateOfferText("\n\n   \r\n")).toBeNull(); // still rejects if only whitespace after strip
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
    expect((POST_OFFER_TOOL.input_schema.properties.text as any).maxLength).toBe(200);
  });
});
