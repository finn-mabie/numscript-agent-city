/**
 * VWAP: Σ(quote_i) / Σ(base_i), i.e. total quote spent / total base received.
 * Returns the volume-weighted average price in quote-minor-units per base unit.
 * null when no samples have positive base volume.
 */
export interface SwapSample {
  quoteAmount: number;  // e.g. USD cents
  baseAmount: number;   // e.g. number of strawberries
  timestamp: number;    // epoch ms (kept for windowing by caller)
}

export function computeVwap(samples: SwapSample[]): number | null {
  let quoteSum = 0;
  let baseSum = 0;
  for (const s of samples) {
    if (s.baseAmount <= 0) continue;
    quoteSum += s.quoteAmount;
    baseSum += s.baseAmount;
  }
  if (baseSum === 0) return null;
  return quoteSum / baseSum;
}

/**
 * Extract swap samples from Formance transactions that moved a target asset
 * paired with USD/2. Walks the `postings` of each tx looking for a matched pair:
 *   - one posting in target asset from agent_a → agent_b
 *   - another posting in USD/2 from agent_b → agent_a (opposite direction)
 * Ignores unmatched (single-asset) txs.
 */
export interface RawTx {
  postings: Array<{ source: string; destination: string; asset: string; amount: number }>;
  timestamp?: string;
}

export function extractSwapSamples(
  txs: RawTx[],
  targetAsset: string,
  quoteAsset = "USD/2"
): SwapSample[] {
  const out: SwapSample[] = [];
  for (const tx of txs) {
    if (!tx.postings || tx.postings.length < 2) continue;
    const targetLeg = tx.postings.find((p) => p.asset === targetAsset);
    if (!targetLeg) continue;
    const quoteLeg = tx.postings.find((p) =>
      p.asset === quoteAsset &&
      p.source === targetLeg.destination &&
      p.destination === targetLeg.source
    );
    if (!quoteLeg) continue;
    out.push({
      quoteAmount: Number(quoteLeg.amount),
      baseAmount: Number(targetLeg.amount),
      timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now()
    });
  }
  return out;
}
