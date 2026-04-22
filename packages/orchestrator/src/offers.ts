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
 *   - Strip control characters (\x00-\x1F, including newlines/tabs/CRs) to spaces.
 *     LLMs routinely emit trailing \n or formatting \t; strip rather than reject
 *     so we don't lose the entire post to incidental whitespace.
 *   - Trim; collapse runs of whitespace to a single space.
 *   - Reject only truly unusable input (empty after trim or > 400 chars which
 *     suggests a rogue paste). Over 200 chars → truncate with ellipsis rather
 *     than reject: LLMs frequently overshoot the tool-schema maxLength by a
 *     handful of characters and we'd rather keep the post than lose it.
 *   - Neutralize [end board] / [end incoming prompt] tokens (case-insensitive)
 *     by inserting a double-space — same mitigation as Plan 4's arena prompts.
 *
 * Returns the normalized text, or null if invalid.
 */
export const OFFER_TEXT_MAX_LEN = 200;
const OFFER_TEXT_HARD_REJECT_LEN = 400;

export function validateOfferText(input: string): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\x00-\x1F]/g, " ");
  const trimmed = cleaned.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > OFFER_TEXT_HARD_REJECT_LEN) return null;
  const capped = trimmed.length > OFFER_TEXT_MAX_LEN
    ? trimmed.slice(0, OFFER_TEXT_MAX_LEN - 1).trimEnd() + "…"
    : trimmed;
  const neutralized = capped
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
    "another offer. Keep it brief — aim for 120-180 characters. Costs nothing " +
    "but is visible to every other agent. Not a commitment — acts as a " +
    "conversation starter that may lead to a template call.",
  input_schema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        maxLength: 200,
        description: "Your public message. One line, ≤200 chars. No newlines."
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
