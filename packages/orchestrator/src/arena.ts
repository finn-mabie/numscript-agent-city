import { createHash, randomBytes } from "node:crypto";

export interface QueuedAttack {
  attackId: string;
  targetAgentId: string;
  prompt: string;
  /** epoch ms of enqueue time; used for TTL */
  enqueuedAt: number;
}

export interface ArenaQueueOptions {
  /** Stale entries beyond this age are skipped on drain. Default 5 min. */
  ttlMs?: number;
  now?: () => number;
}

export interface ArenaQueue {
  enqueue(args: { attackId: string; targetAgentId: string; prompt: string }): void;
  drain(targetAgentId: string): QueuedAttack | null;
  peek(targetAgentId: string): QueuedAttack | null;
  size(targetAgentId: string): number;
}

export function createArenaQueue(opts: ArenaQueueOptions = {}): ArenaQueue {
  const ttl = opts.ttlMs ?? 5 * 60 * 1000;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, QueuedAttack[]>();

  function prune(bucket: QueuedAttack[]): void {
    const cutoff = now() - ttl;
    while (bucket.length && bucket[0].enqueuedAt < cutoff) bucket.shift();
  }

  return {
    enqueue({ attackId, targetAgentId, prompt }) {
      const list = buckets.get(targetAgentId) ?? [];
      list.push({ attackId, targetAgentId, prompt, enqueuedAt: now() });
      buckets.set(targetAgentId, list);
    },
    drain(targetAgentId) {
      const list = buckets.get(targetAgentId);
      if (!list) return null;
      prune(list);
      return list.shift() ?? null;
    },
    peek(targetAgentId) {
      const list = buckets.get(targetAgentId);
      if (!list) return null;
      prune(list);
      return list[0] ?? null;
    },
    size(targetAgentId) {
      const list = buckets.get(targetAgentId);
      if (!list) return 0;
      prune(list);
      return list.length;
    }
  };
}

/** Returns "atk_<base36-ts>_<hex8>"; collision-resistant for demo scale. */
export function newAttackId(now: () => number = Date.now): string {
  const ts = now().toString(36);
  const rand = randomBytes(4).toString("hex");
  return `atk_${ts}_${rand}`;
}

export function hashPrompt(prompt: string, salt: string): string {
  return createHash("sha256").update(salt).update("\0").update(prompt).digest("hex");
}

export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(salt).update("\0ip\0").update(ip).digest("hex");
}

/** Extracts ~140-char preview for HUD display, collapsing whitespace. */
export function promptPreview(prompt: string): string {
  const flat = prompt.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? flat.slice(0, 137) + "…" : flat;
}
