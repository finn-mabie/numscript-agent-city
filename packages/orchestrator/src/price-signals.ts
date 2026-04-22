import { randomBytes } from "node:crypto";

export const PRICE_SIGNAL_ID_RE = /^ps_[a-z0-9]+_[a-f0-9]{4}$/;
export const SIGNAL_NOTE_MAX_LEN = 200;

export function newPriceSignalId(now: () => number = Date.now): string {
  const ts = now().toString(36);
  const rand = randomBytes(2).toString("hex");
  return `ps_${ts}_${rand}`;
}

export function validateSignalNote(input: string | undefined): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > 400) return null;
  const capped = cleaned.length > SIGNAL_NOTE_MAX_LEN
    ? cleaned.slice(0, SIGNAL_NOTE_MAX_LEN - 1).trimEnd() + "…"
    : cleaned;
  return capped
    .replace(/\[end dms\]/gi,              "[end  dms]")
    .replace(/\[end board\]/gi,            "[end  board]")
    .replace(/\[end incoming prompt\]/gi,  "[end  incoming prompt]")
    .replace(/\[end price signals\]/gi,    "[end  price signals]");
}
