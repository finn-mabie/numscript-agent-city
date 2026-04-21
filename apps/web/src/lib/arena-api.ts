const BASE = process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";

export interface ArenaSubmitResult {
  attackId: string;
  targetAgentId: string;
  submittedAt: number;
}

export async function submitArenaAttack(args: {
  targetAgentId: string;
  prompt: string;
}): Promise<ArenaSubmitResult> {
  const res = await fetch(`${BASE}/arena`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args)
  });
  if (res.status === 429) {
    const retry = res.headers.get("retry-after") ?? "60";
    throw new ArenaRateLimitedError(Number(retry));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export class ArenaRateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds}s.`);
    this.name = "ArenaRateLimitedError";
  }
}
