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
  const intervalMs = opts.intervalMs ?? 3000;
  const now = opts.now ?? Date.now;
  const ag = agentRepo(opts.db);
  let stopped = false;
  let running: Promise<void> = Promise.resolve();

  async function pump(): Promise<void> {
    if (stopped) return;
    const due = ag.dueAt(now());
    for (const agent of due) {
      if (stopped) return;
      try {
        await opts.tickOne(agent);
      } catch (e) {
        opts.onError?.(agent.id, e);
        // Still advance this agent's next_tick_at so a poison tick doesn't loop
        ag.updateNextTick(agent.id, now() + 60_000);
      }
    }
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
