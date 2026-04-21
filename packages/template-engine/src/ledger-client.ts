import type { LedgerTx } from "./types.js";

interface ScriptCall {
  plain: string;
  vars: Record<string, string>;
  reference?: string;
  metadata?: Record<string, string>;
}

export type LedgerResult<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

export interface LedgerClientOptions {
  /**
   * Optional callback that returns an OAuth2 bearer token. Called on every
   * request; the caller is responsible for caching and refreshing. If omitted,
   * no Authorization header is sent (suitable for unauthenticated local dev).
   */
  getAuthToken?: () => Promise<string>;
}

// ─── Raw Formance v2 response shapes ────────────────────────────────────────
// These mirror what the ledger actually returns. Narrow once at the fetch
// boundary so every other consumer is typed.

interface RawPosting {
  source: string;
  destination: string;
  asset: string;
  amount: number | string;
}

interface RawTx {
  id?: number | string;
  txid?: number | string;
  timestamp?: string;
  postings?: RawPosting[];
  metadata?: Record<string, string>;
}

interface RawError {
  errorCode?: string;
  errorMessage?: string;
  message?: string;
}

// Formance responses are sometimes `{data: {...}}` and sometimes just `{...}`.
// Normalize to the inner object.
type RawEnvelope<T> = T | { data: T };

function unwrap<T>(env: RawEnvelope<T>): T {
  if (env && typeof env === "object" && "data" in env) return (env as { data: T }).data;
  return env as T;
}

function unpackTx(raw: RawTx): LedgerTx {
  const postings = (raw.postings ?? []).map((p) => ({
    source: p.source,
    destination: p.destination,
    asset: p.asset,
    amount: Number(p.amount)
  }));
  return {
    id: String(raw.id ?? raw.txid ?? ""),
    timestamp: raw.timestamp ?? new Date().toISOString(),
    postings,
    txMeta: raw.metadata ?? {},
    accountMeta: {}
  };
}

export class LedgerClient {
  constructor(
    private baseUrl: string,
    private ledger: string,
    private options: LedgerClientOptions = {}
  ) {}

  async dryRun(
    call: ScriptCall
  ): Promise<LedgerResult<{ postings: LedgerTx["postings"]; txMeta: Record<string, string> }>> {
    const r = await this.post(call, true);
    if (!r.ok) return r;
    return { ok: true, postings: r.tx.postings, txMeta: r.tx.txMeta };
  }

  async commit(call: ScriptCall): Promise<LedgerResult<{ tx: LedgerTx }>> {
    const r = await this.post(call, false);
    if (r.ok) return { ok: true, tx: r.tx };

    // Idempotency: if the reference already exists on the ledger, fetch and return it.
    if (call.reference && r.code === "CONFLICT") {
      const existing = await this.findByReference(call.reference);
      if (existing) return { ok: true, tx: existing };
    }
    return r;
  }

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.options.getAuthToken) {
      h["Authorization"] = `Bearer ${await this.options.getAuthToken()}`;
    }
    return h;
  }

  private async findByReference(reference: string): Promise<LedgerTx | null> {
    const res = await fetch(
      `${this.baseUrl}/v2/${this.ledger}/transactions?reference=${encodeURIComponent(reference)}`,
      { headers: await this.headers() }
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as RawEnvelope<
      { cursor?: { data?: RawTx[] } } | RawTx[]
    >;
    const inner = unwrap(body);
    const list: RawTx[] = Array.isArray(inner) ? inner : inner?.cursor?.data ?? [];
    const hit = list[0];
    return hit ? unpackTx(hit) : null;
  }

  private async post(call: ScriptCall, dryRun: boolean): Promise<LedgerResult<{ tx: LedgerTx }>> {
    const qs = dryRun ? "?dry_run=true" : "";
    const res = await fetch(`${this.baseUrl}/v2/${this.ledger}/transactions${qs}`, {
      method: "POST",
      headers: await this.headers(),
      body: JSON.stringify({
        script: { plain: call.plain, vars: call.vars },
        reference: call.reference,
        metadata: call.metadata
      })
    });
    const body = (await res.json().catch(() => ({}))) as RawEnvelope<RawTx> & RawError;
    if (!res.ok) {
      return {
        ok: false,
        code: body.errorCode ?? `HTTP_${res.status}`,
        message: body.errorMessage ?? body.message ?? "ledger error"
      };
    }
    return { ok: true, tx: unpackTx(unwrap(body)) };
  }
}
