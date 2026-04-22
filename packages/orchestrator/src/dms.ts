import { randomBytes } from "node:crypto";
import type { AnthropicTool } from "./tool-schema.js";

/** Shape: "dm_<base36 timestamp>_<hex4>" — sortable + collision-resistant. */
export const DM_ID_RE = /^dm_[a-z0-9]+_[a-f0-9]{4}$/;

/** Soft cap on DM text. LLMs routinely overshoot tool-schema maxLength by a
 *  handful of chars; we truncate rather than reject to preserve intent. */
export const DM_TEXT_MAX_LEN = 200;
const DM_TEXT_HARD_REJECT_LEN = 400;

export function newDmId(now: () => number = Date.now): string {
  const ts = now().toString(36);
  const rand = randomBytes(2).toString("hex");
  return `dm_${ts}_${rand}`;
}

/**
 * Same policy as validateOfferText:
 *   - Strip control chars (\x00-\x1F incl. newlines/tabs) to spaces.
 *   - Trim + collapse whitespace.
 *   - Reject empty post-trim and > 400 chars (rogue input).
 *   - Truncate soft-cap (200) with ellipsis.
 *   - Neutralize [end dms], [end board], [end incoming prompt] (case-insensitive)
 *     so a DM can't break out of ITS own block AND also can't break out of the
 *     board or arena-prompt blocks if quoted into them.
 */
export function validateDmText(input: string): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\x00-\x1F]/g, " ");
  const trimmed = cleaned.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > DM_TEXT_HARD_REJECT_LEN) return null;
  const capped = trimmed.length > DM_TEXT_MAX_LEN
    ? trimmed.slice(0, DM_TEXT_MAX_LEN - 1).trimEnd() + "…"
    : trimmed;
  const neutralized = capped
    .replace(/\[end dms\]/gi,              "[end  dms]")
    .replace(/\[end board\]/gi,            "[end  board]")
    .replace(/\[end incoming prompt\]/gi,  "[end  incoming prompt]");
  return neutralized;
}

/**
 * Anthropic tool descriptor for send_dm. Added to every tick's tool list
 * alongside post_offer + IDLE_TOOL + the 13 templates.
 */
export const SEND_DM_TOOL: AnthropicTool = {
  name: "send_dm",
  description:
    "Send a private 1:1 message to one specific agent. Not visible to anyone else. " +
    "Use this when you want to negotiate terms, acknowledge a commitment, or ask a " +
    "targeted question that isn't worth broadcasting to the whole city. " +
    "≤200 characters. One line, no newlines.",
  input_schema: {
    type: "object",
    properties: {
      to: {
        type: "string",
        pattern: "^[0-9]{3}$",
        description: "The target agent's id, e.g. \"002\". Cannot be your own id."
      },
      text: {
        type: "string",
        maxLength: DM_TEXT_MAX_LEN,
        description: "Your message to this specific agent. ≤200 chars, one line."
      },
      in_reply_to: {
        type: "string",
        description: "Optional — either a dm_xxx id (replying to a DM) or an off_xxx id (continuing a board thread privately)."
      }
    },
    required: ["to", "text"],
    additionalProperties: false
  }
};
