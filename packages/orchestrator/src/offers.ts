import { randomBytes } from "node:crypto";
import type { AnthropicTool } from "./tool-schema.js";

/** Shape: "off_<base36 timestamp>_<hex4>" — sortable + collision-resistant for demo scale. */
export const OFFER_ID_RE = /^off_[a-z0-9]+_[a-f0-9]{4}$/;

export function newOfferId(now: () => number = Date.now): string {
  const ts = now().toString(36);
  const rand = randomBytes(2).toString("hex");
  return `off_${ts}_${rand}`;
}

/**
 * Validates + normalizes agent-authored offer text.
 *
 * Rules:
 *   - Trim; collapse runs of whitespace to a single space.
 *   - Reject empty (post-trim) or > 140 chars.
 *   - Reject control characters (\x00-\x1F) and newlines.
 *   - Neutralize [end board] / [end incoming prompt] tokens (case-insensitive)
 *     by inserting a double-space — same mitigation as Plan 4's arena prompts.
 *
 * Returns the normalized text, or null if invalid.
 */
export function validateOfferText(input: string): string | null {
  if (typeof input !== "string") return null;
  if (/[\x00-\x1F]/.test(input)) return null;
  const trimmed = input.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > 140) return null;
  const neutralized = trimmed
    .replace(/\[end board\]/gi,           "[end  board]")
    .replace(/\[end incoming prompt\]/gi, "[end  incoming prompt]");
  return neutralized;
}

/**
 * Anthropic tool descriptor for post_offer. Added to every tick's tool list
 * alongside the 13 templates + idle.
 */
export const POST_OFFER_TOOL: AnthropicTool = {
  name: "post_offer",
  description:
    "Post a short public message to the city's Intent Board. Use this to ask " +
    "for a service, offer one, advertise spread opportunities, or respond to " +
    "another offer. ≤140 characters. Costs nothing but is visible to every " +
    "other agent. Not a commitment — acts as a conversation starter that may " +
    "lead to a template call.",
  input_schema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        maxLength: 140,
        description: "Your public message. Keep under 140 chars. One line, no newlines."
      },
      in_reply_to: {
        type: "string",
        pattern: "^off_[a-z0-9]+_[a-f0-9]{4}$",
        description: "If responding to a specific offer, its id. Omit for a fresh offer."
      }
    },
    required: ["text"],
    additionalProperties: false
  }
};
