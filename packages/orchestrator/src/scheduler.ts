import type Database from "better-sqlite3";
import { agentRepo } from "./repositories.js";
import type { AgentRecord, TickOutcome } from "./types.js";

export interface SchedulerOptions {
  db: Database.Database;
  intervalMs?: number;          // how often to poll the `due` queue (default 3s)
  now?: () => number;
  tickOne: (agent: AgentRecord) => Promise<TickOutcome>;
  onError?: (agentId: string, err: unknown) => void;
}

export interface SchedulerHandle {
  stop(): Promise<void>;
}

export function startScheduler(opts: SchedulerOptions): SchedulerHandle {
  // Default 750ms poll — fast enough that new due-ticks fire within a second
  // of their deadline (important for arena/board advance-hooks that nudge
  // nextTickAt to now+2s).
  const intervalMs = opts.intervalMs ?? 750;
  const now = opts.now ?? Date.now;
  const ag = agentRepo(opts.db);
  let stopped = false;
  let running: Promise<void> = Promise.resolve();

  async function pump(): Promise<void> {
    if (stopped) return;
    const due = ag.dueAt(now());
    // Parallel fan-out: due agents tick concurrently. Without this, a queue
    // of 3 agents with ~2s LLM calls each serialized into 6s of head-of-line
    // blocking, making the UI feel stuck. Concurrency is bounded by `due`
    // size (≤ number of agents), so no runaway.
    await Promise.all(
      due.map(async (agent) => {
        if (stopped) return;
        try {
          await opts.tickOne(agent);
        } catch (e) {
          opts.onError?.(agent.id, e);
          // Still advance this agent's next_tick_at so a poison tick doesn't loop
          ag.updateNextTick(agent.id, now() + 60_000);
        }
      })
    );
  }

  const timer = setInterval(() => {
    running = running.then(pump);
  }, intervalMs);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    }
  };
}
