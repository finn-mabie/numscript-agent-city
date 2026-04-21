import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { agentRepo, intentLogRepo } from "./repositories.js";

export interface StartHttpOptions {
  port: number;
  db: Database.Database;
  /** Returns the minor-unit balance of an account, or null on error. */
  getBalance: (address: string) => Promise<number | null>;
  /** Proxies an arbitrary GET against the Formance ledger's HTTP API. */
  ledgerGet: (path: string) => Promise<{ ok: boolean; status: number; body: unknown }>;
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

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

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
    if (req.method !== "GET" || !req.url) {
      json(res, 404, { error: "not found" });
      return;
    }

    const url = new URL(req.url, "http://127.0.0.1");
    const path = url.pathname;

    // ── /snapshot ────────────────────────────────────────────────────────
    if (path === "/snapshot") {
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
        return json(res, 200, { agents: withBalances, recent: recent.slice(0, limit * 5) });
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }

    // ── /agent/:id ───────────────────────────────────────────────────────
    // Live view of one agent, pulled straight from the Formance ledger.
    // Returns: { agent (roster), balance, account (raw ledger account with metadata),
    //           transactions (last N ledger txs touching this agent) }
    const agentMatch = path.match(/^\/agent\/(\d{3})$/);
    if (agentMatch) {
      const id = agentMatch[1];
      const agent = ag.get(id);
      if (!agent) return json(res, 404, { error: `no agent ${id}` });

      const address = `agents:${id}:available`;
      try {
        const [accountRes, txsRes] = await Promise.all([
          opts.ledgerGet(`/accounts/${encodeURIComponent(address)}?expand=volumes`),
          opts.ledgerGet(`/transactions?account=${encodeURIComponent(address)}&pageSize=25`)
        ]);

        const accountData = extractData(accountRes.body);
        const txsData = extractCursorData(txsRes.body);
        const balance = Number(accountData?.volumes?.["USD/2"]?.balance ?? 0);
        const metadata = accountData?.metadata ?? {};

        return json(res, 200, {
          agent: {
            id: agent.id, name: agent.name, role: agent.role,
            tagline: agent.tagline, color: agent.color,
            hustleMode: agent.hustleMode
          },
          balance,
          metadata,
          transactions: (Array.isArray(txsData) ? txsData : [])
            .slice(0, 25)
            .map(normalizeLedgerTx),
          intentLog: log.recent(id, 25)
        });
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }

    // ── /tx/:id ──────────────────────────────────────────────────────────
    // Pull a single ledger transaction (postings, metadata, timestamp).
    const txMatch = path.match(/^\/tx\/(\d+)$/);
    if (txMatch) {
      const txId = txMatch[1];
      try {
        const r = await opts.ledgerGet(`/transactions/${encodeURIComponent(txId)}`);
        if (!r.ok) return json(res, r.status, { error: "ledger lookup failed" });
        const data = extractData(r.body);
        return json(res, 200, normalizeLedgerTx(data));
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }

    json(res, 404, { error: "not found" });
  });

  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return { port, server };
}

// ── helpers ────────────────────────────────────────────────────────────────
// Formance wraps responses in { data: ... } sometimes and returns flat other times.
function extractData(body: unknown): any {
  if (body && typeof body === "object" && "data" in body) return (body as any).data;
  return body;
}
function extractCursorData(body: unknown): any {
  const b = body as any;
  if (b?.cursor?.data) return b.cursor.data;
  if (b?.data?.cursor?.data) return b.data.cursor.data;
  if (b?.data) return Array.isArray(b.data) ? b.data : [];
  return [];
}
function normalizeLedgerTx(raw: any): any {
  if (!raw) return null;
  return {
    id: String(raw.id ?? raw.txid ?? ""),
    timestamp: raw.timestamp ?? null,
    reference: raw.reference ?? null,
    postings: (raw.postings ?? []).map((p: any) => ({
      source: p.source,
      destination: p.destination,
      asset: p.asset,
      amount: Number(p.amount)
    })),
    metadata: raw.metadata ?? {}
  };
}
