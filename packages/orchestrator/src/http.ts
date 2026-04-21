import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { agentRepo, intentLogRepo } from "./repositories.js";

export interface StartHttpOptions {
  port: number;
  db: Database.Database;
  /** Returns the minor-unit balance of an account, or null on error. */
  getBalance: (address: string) => Promise<number | null>;
  /** How many recent intent-log entries per agent (default 20). */
  recentLimit?: number;
}

export interface HttpHandle {
  port: number;
  server: Server;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type"
};

export async function startHttp(opts: StartHttpOptions): Promise<HttpHandle> {
  const limit = opts.recentLimit ?? 20;
  const ag = agentRepo(opts.db);
  const log = intentLogRepo(opts.db);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/snapshot") {
      try {
        const agents = ag.list();
        const withBalances = await Promise.all(
          agents.map(async (a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            tagline: a.tagline,
            color: a.color,
            hustleMode: a.hustleMode,
            balance: (await opts.getBalance(`@agents:${a.id}:available`)) ?? 0
          }))
        );
        const recent = agents.flatMap((a) => log.recent(a.id, limit));
        recent.sort((x, y) => y.createdAt - x.createdAt);

        res.writeHead(200, { "content-type": "application/json", ...CORS });
        res.end(JSON.stringify({ agents: withBalances, recent: recent.slice(0, limit * 5) }));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json", ...CORS });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }

    res.writeHead(404, CORS);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return { port, server };
}
