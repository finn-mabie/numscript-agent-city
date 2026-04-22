import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type Database from "better-sqlite3";
import { agentRepo, intentLogRepo } from "./repositories.js";
import type { ArenaQueue } from "./arena.js";
import type { arenaRepo } from "./repositories.js";
import type { offerRepo as offerRepoFactory } from "./repositories.js";
import type { dmRepo as dmRepoFactory } from "./repositories.js";
import { newAttackId, hashPrompt, hashIp, promptPreview } from "./arena.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";

export interface StartHttpOptions {
  port: number;
  db: Database.Database;
  /** Returns the minor-unit balance of an account, or null on error. */
  getBalance: (address: string) => Promise<number | null>;
  /** Proxies an arbitrary GET against the Formance ledger's HTTP API. */
  ledgerGet: (path: string) => Promise<{ ok: boolean; status: number; body: unknown }>;
  /** How many recent intent-log entries per agent (default 20). */
  recentLimit?: number;
  /** Present only when the arena is wired (run-city path, not tests that only exercise /snapshot). */
  arenaQueue?: ArenaQueue;
  arenaRepo?: ReturnType<typeof arenaRepo>;
  /** Per-process salt for prompt + IP hashing. Must be ≥16 bytes random. */
  arenaSalt?: string;
  arenaRateLimit?: { max: number; windowMs: number };
  /** Hook invoked after an attack is enqueued. Receives metadata so callers can
   * bring the agent's nextTickAt forward AND emit a WS pulse with the real attackId. */
  advanceNextTickFor?: (args: {
    agentId: string;
    attackId: string;
    promptPreview: string;
    submittedAt: number;
  }) => void;
  /** Absolute path to the templates root. When set, /template/:id and /templates are exposed. */
  templatesRoot?: string;
  offerRepo?: ReturnType<typeof offerRepoFactory>;
  dmRepo?: ReturnType<typeof dmRepoFactory>;
}

export interface HttpHandle {
  port: number;
  server: Server;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type"
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 8192;

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw Object.assign(new Error("body too large"), { code: "BODY_TOO_LARGE" });
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error("invalid JSON"); }
}

function clientIp(req: IncomingMessage): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf) return xf.split(",")[0].trim();
  return req.socket.remoteAddress ?? "0.0.0.0";
}

export async function startHttp(opts: StartHttpOptions): Promise<HttpHandle> {
  const limit = opts.recentLimit ?? 20;
  const ag = agentRepo(opts.db);
  const log = intentLogRepo(opts.db);

  const arenaLimiter: RateLimiter | null = opts.arenaRateLimit
    ? createRateLimiter(opts.arenaRateLimit)
    : null;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url && new URL(req.url, "http://127.0.0.1").pathname === "/arena") {
      if (!opts.arenaQueue || !opts.arenaRepo || !opts.arenaSalt) {
        return json(res, 503, { error: "arena not configured" });
      }
      let body: any;
      try { body = await readJson(req); }
      catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "BODY_TOO_LARGE") return json(res, 413, { error: "body too large" });
        return json(res, 400, { error: "invalid JSON" });
      }
      const targetAgentId = typeof body?.targetAgentId === "string" ? body.targetAgentId : null;
      const prompt = typeof body?.prompt === "string" ? body.prompt : null;
      if (!targetAgentId || !prompt) return json(res, 400, { error: "targetAgentId and prompt required" });
      if (prompt.length > 2000) return json(res, 413, { error: "prompt > 2000 chars" });

      const ip = clientIp(req);
      const ipH = hashIp(ip, opts.arenaSalt);
      if (arenaLimiter) {
        const r = arenaLimiter.check(ipH);
        if (!r.allowed) {
          res.writeHead(429, {
            "content-type": "application/json",
            "retry-after": String(Math.ceil(r.retryAfterMs / 1000)),
            ...CORS
          });
          return res.end(JSON.stringify({ error: "rate limited", retryAfterMs: r.retryAfterMs }));
        }
      }

      if (!ag.get(targetAgentId)) return json(res, 404, { error: `unknown agent ${targetAgentId}` });

      const attackId = newAttackId();
      const submittedAt = Date.now();
      opts.arenaRepo.insert({
        attackId, targetAgentId,
        promptHash: hashPrompt(prompt, opts.arenaSalt),
        promptPreview: promptPreview(prompt),
        ipHash: ipH, submittedAt
      });
      opts.arenaQueue.enqueue({ attackId, targetAgentId, prompt });
      opts.advanceNextTickFor?.({
        agentId: targetAgentId,
        attackId,
        promptPreview: promptPreview(prompt),
        submittedAt
      });

      return json(res, 202, { attackId, targetAgentId, submittedAt });
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

    // ── /templates ───────────────────────────────────────────────────────
    // Minimal listing: just the ids. Useful for a future template browser.
    if (path === "/templates") {
      if (!opts.templatesRoot) return json(res, 503, { error: "templates root not configured" });
      try {
        const { readdirSync } = await import("node:fs");
        const ids = readdirSync(opts.templatesRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory() && /^[a-z][a-z0-9_]+$/.test(d.name))
          .map((d) => d.name)
          .sort();
        return json(res, 200, { templates: ids });
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }

    // ── /template/:id ────────────────────────────────────────────────────
    // Returns the raw Numscript source + schema + example for a given template.
    // Used by the front-end TxPanel to show WHY a tx was structured the way it was.
    const templateMatch = path.match(/^\/template\/([a-z][a-z0-9_]+)$/);
    if (templateMatch) {
      if (!opts.templatesRoot) return json(res, 503, { error: "templates root not configured" });
      const id = templateMatch[1];
      // Defense-in-depth: id already regex-filtered, but resolve + prefix-check anyway
      const dir = resolvePath(opts.templatesRoot, id);
      if (!dir.startsWith(opts.templatesRoot)) return json(res, 400, { error: "invalid template id" });
      const numPath = resolvePath(dir, "template.num");
      const schemaPath = resolvePath(dir, "schema.json");
      const examplePath = resolvePath(dir, "example.json");
      const readmePath = resolvePath(dir, "README.md");
      if (!existsSync(numPath)) return json(res, 404, { error: `template ${id} not found` });
      try {
        const source = readFileSync(numPath, "utf8");
        const schema = existsSync(schemaPath) ? JSON.parse(readFileSync(schemaPath, "utf8")) : null;
        const example = existsSync(examplePath) ? JSON.parse(readFileSync(examplePath, "utf8")) : null;
        const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : null;
        return json(res, 200, { id, source, schema, example, readme });
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }

    // ── /offers ──────────────────────────────────────────────────────────
    if (path === "/offers") {
      if (!opts.offerRepo) return json(res, 503, { error: "offers not configured" });
      try {
        return json(res, 200, { offers: opts.offerRepo.openOffers(20) });
      } catch (e) {
        return json(res, 500, { error: (e as Error).message });
      }
    }

    // ── /offers/:id ──────────────────────────────────────────────────────
    const offerMatch = path.match(/^\/offers\/(off_[a-z0-9_]+)$/);
    if (offerMatch) {
      if (!opts.offerRepo) return json(res, 503, { error: "offers not configured" });
      const id = offerMatch[1];
      const offer = opts.offerRepo.get(id);
      if (!offer) return json(res, 404, { error: `offer ${id} not found` });
      const rootId = offer.inReplyTo ?? offer.id;
      const thread = opts.offerRepo.threadOf(rootId);
      return json(res, 200, { offer, thread });
    }

    // ── /dms/agent/:id ──────────────────────────────────────────────────
    // Returns the most-recent 50 DMs involving this agent (either as sender
    // or recipient), newest-first. Used by AgentPanel's Conversations tab.
    const dmsMatch = path.match(/^\/dms\/agent\/(\d{3})$/);
    if (dmsMatch) {
      if (!opts.dmRepo) return json(res, 503, { error: "dms not configured" });
      const id = dmsMatch[1];
      if (!ag.get(id)) return json(res, 404, { error: `agent ${id} not found` });
      const list = opts.dmRepo.involvingAgent(id, 50);
      return json(res, 200, { agentId: id, dms: list });
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
