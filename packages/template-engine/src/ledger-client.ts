import type { LedgerPreview, LedgerTx } from "./types.js";

interface ScriptCall {
  plain: string;
  vars: Record<string, string>;
  reference?: string;
  metadata?: Record<string, string>;
}

export type LedgerResult<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };

export class LedgerClient {
  constructor(private baseUrl: string, private ledger: string) {}

  async dryRun(call: ScriptCall): Promise<LedgerResult<{ postings: LedgerPreview["postings"]; txMeta: Record<string, string> }>> {
    return this.post(call, true);
  }

  async commit(call: ScriptCall): Promise<LedgerResult<{ tx: LedgerTx }>> {
    const r = await this.post(call, false);
    if (!r.ok) {
      // Idempotency: if the reference already exists, return the existing tx.
      if (call.reference && r.code === "CONFLICT") {
        const existing = await this.findByReference(call.reference);
        if (existing) return { ok: true, tx: existing };
      }
      return r;
    }
    const body = r as any;
    return { ok: true, tx: body.tx };
  }

  private async findByReference(reference: string): Promise<LedgerTx | null> {
    const res = await fetch(
      `${this.baseUrl}/v2/${this.ledger}/transactions?reference=${encodeURIComponent(reference)}`
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const data = body.cursor?.data ?? body.data ?? [];
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    const postings = (hit.postings ?? []).map((p: any) => ({
      source: p.source, destination: p.destination, asset: p.asset, amount: Number(p.amount)
    }));
    return {
      id: String(hit.id ?? hit.txid ?? ""),
      timestamp: hit.timestamp ?? new Date().toISOString(),
      postings,
      txMeta: hit.metadata ?? {},
      accountMeta: {}
    };
  }

  private async post(call: ScriptCall, dryRun: boolean): Promise<any> {
    const qs = dryRun ? "?dry_run=true" : "";
    const res = await fetch(`${this.baseUrl}/v2/${this.ledger}/transactions${qs}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        script: { plain: call.plain, vars: call.vars },
        reference: call.reference,
        metadata: call.metadata
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, code: body.errorCode ?? `HTTP_${res.status}`, message: body.errorMessage ?? body.message ?? "ledger error" };
    }
    const data = body.data ?? body;
    const postings = (data.postings ?? []).map((p: any) => ({
      source: p.source, destination: p.destination, asset: p.asset, amount: Number(p.amount)
    }));
    const txMeta = data.metadata ?? {};
    const tx: LedgerTx = {
      id: String(data.id ?? data.txid ?? ""),
      timestamp: data.timestamp ?? new Date().toISOString(),
      postings, txMeta, accountMeta: {}
    };
    return { ok: true, postings, txMeta, tx };
  }
}
