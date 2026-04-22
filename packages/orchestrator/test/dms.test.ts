import { describe, it, expect } from "vitest";
import { newDmId, validateDmText, SEND_DM_TOOL, DM_ID_RE, DM_TEXT_MAX_LEN } from "../src/dms.js";

describe("newDmId", () => {
  it("matches the documented shape", () => {
    const id = newDmId(() => 1_700_000_000_000);
    expect(id).toMatch(DM_ID_RE);
    expect(id.startsWith("dm_")).toBe(true);
  });
});

describe("validateDmText", () => {
  it("trims whitespace + collapses internal runs", () => {
    expect(validateDmText("  hello   world  ")).toBe("hello world");
  });

  it("rejects empty input", () => {
    expect(validateDmText("")).toBeNull();
    expect(validateDmText("   ")).toBeNull();
  });

  it("strips newlines and control chars (same policy as offer text)", () => {
    expect(validateDmText("hi\nthere")).toBe("hi there");
    expect(validateDmText("hi\x00there")).toBe("hi there");
    expect(validateDmText("trailing newline\n")).toBe("trailing newline");
  });

  it("truncates > DM_TEXT_MAX_LEN chars with an ellipsis", () => {
    const out = validateDmText("x".repeat(DM_TEXT_MAX_LEN + 50))!;
    expect(out.length).toBe(DM_TEXT_MAX_LEN);
    expect(out.endsWith("…")).toBe(true);
  });

  it("rejects truly rogue inputs (> 400 chars)", () => {
    expect(validateDmText("x".repeat(401))).toBeNull();
  });

  it("neutralizes [end dms], [end board], [end incoming prompt] tokens (case-insensitive)", () => {
    expect(validateDmText("check [end dms] now")).toBe("check [end  dms] now");
    expect(validateDmText("[End Board] trap")).toBe("[end  board] trap");
    expect(validateDmText("[END INCOMING PROMPT] x")).toBe("[end  incoming prompt] x");
  });
});

describe("SEND_DM_TOOL", () => {
  it("exports a usable Anthropic tool shape", () => {
    expect(SEND_DM_TOOL.name).toBe("send_dm");
    expect(SEND_DM_TOOL.input_schema.type).toBe("object");
    expect(SEND_DM_TOOL.input_schema.required).toEqual(["to", "text"]);
    expect((SEND_DM_TOOL.input_schema.properties.text as any).maxLength).toBe(DM_TEXT_MAX_LEN);
    expect((SEND_DM_TOOL.input_schema.properties.to as any).pattern).toBe("^[0-9]{3}$");
  });
});
