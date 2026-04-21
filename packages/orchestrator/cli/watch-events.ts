#!/usr/bin/env tsx
import WebSocket from "ws";
import type { CityEvent } from "../src/index.js";

const url = process.env.CITY_WS_URL ?? "ws://127.0.0.1:3070";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function ts(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function format(e: CityEvent): string {
  const head = `${dim(ts(e.at))} ${bold(e.agentId)}`;
  switch (e.kind) {
    case "tick-start": return `${head} ${dim("··· tick")}`;
    case "intent":     return `${head} ${cyan("→")} ${e.data?.tool} ${dim(JSON.stringify(e.data?.input).slice(0, 80))}`;
    case "dry-run":    return `${head} ${dim("dry-run ok")}`;
    case "committed":  return `${head} ${green("✓")} ${e.data?.templateId} ${dim(`tx ${e.data?.txId}`)}`;
    case "rejected":   return `${head} ${red("✗")} ${e.data?.code} ${dim(`(${e.data?.phase})`)} ${e.data?.message}`;
    case "idle":       return `${head} ${dim("idle")}`;
    case "hustle-enter": return `${head} ${yellow("♦ hustle mode on")}`;
    case "hustle-exit":  return `${head} ${yellow("♦ hustle mode off")}`;
    case "relationship-update": return `${head} ${dim(`rel ${e.data?.peerId} ↔ ${e.data?.trust}`)}`;
    case "arena-submit": return `${head} ${cyan("[arena]")} submit attack ${dim(String(e.data?.attackId))}`;
    case "arena-resolved": return `${head} ${cyan("[arena]")} resolved ${String(e.data?.outcome)} ${dim(String(e.data?.attackId))}`;
    case "offer-posted":
      return `${head} ${dim("offer")} ${(e.data as any).text?.slice(0, 60) ?? ""}`;
    case "offer-closed":
      return `${head} ${dim("offer-closed")} ${(e.data as any).offerId}`;
    default: {
      const _exhaustive: never = e.kind;
      return `${head} ${dim(`(unhandled ${(_exhaustive as any)})`)}`;
    }
  }
}

const ws = new WebSocket(url);
ws.on("open", () => console.error(dim(`connected ${url}`)));
ws.on("message", (raw) => {
  try { console.log(format(JSON.parse(raw.toString()))); }
  catch { console.log(raw.toString()); }
});
ws.on("close", () => console.error(dim("closed")));
ws.on("error", (e) => { console.error("ws error:", e.message); process.exit(1); });
