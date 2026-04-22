"use client";
import { useEffect, useState } from "react";

const ORCH_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";

const ASSETS = [
  { code: "STRAWBERRY/0",   label: "🍓 Strawberry",   decimals: 0 },
  { code: "COMPUTEHOUR/0",  label: "💻 Compute hour", decimals: 0 },
  { code: "EUR/2",          label: "€ Euro",          decimals: 2 },
  { code: "USD/2",          label: "$ US Dollar",     decimals: 2 }
];

export default function PriceSignalModal() {
  const [open, setOpen] = useState(false);
  const [asset, setAsset] = useState("STRAWBERRY/0");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("nac:price-signal-open", h);
    return () => window.removeEventListener("nac:price-signal-open", h);
  }, []);

  if (!open) return null;

  const assetMeta = ASSETS.find((a) => a.code === asset)!;

  async function submit() {
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0.01) {
      setStatus("error");
      setErr("Enter a valid price > $0.00");
      return;
    }
    // Backend expects minor units. For 2-decimal currencies, multiply by 100.
    // For 0-decimal commodities the UI unit IS USD-per-unit (major) so we
    // multiply by 100 to get USD cents per unit.
    const minor = Math.round(priceNum * 100);
    setStatus("sending"); setErr(null);
    try {
      const r = await fetch(`${ORCH_BASE}/market/${encodeURIComponent(asset)}/signal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetPrice: minor, durationMs: 10 * 60_000, note: note || undefined })
      });
      if (r.status === 429) { setStatus("error"); setErr("Slow down — try again in a minute."); return; }
      if (!r.ok) { setStatus("error"); setErr((await r.json().catch(() => ({}))).error ?? "failed"); return; }
      setStatus("idle");
      setOpen(false);
      setPrice(""); setNote("");
    } catch (e) {
      setStatus("error"); setErr((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="bg-ink border border-mute p-5 w-[340px] font-mono text-[12px]">
        <div className="text-[10px] uppercase tracking-wider text-dim mb-2">🎯 Set a target price</div>
        <label className="text-[10px] text-dim block mt-2">Asset</label>
        <select value={asset} onChange={(e) => setAsset(e.target.value)} className="w-full bg-ink border border-mute text-paper p-1">
          {ASSETS.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
        </select>
        <label className="text-[10px] text-dim block mt-3">Target price per unit (USD)</label>
        <input type="number" min="0" step={assetMeta.decimals === 2 ? "0.01" : "0.01"} value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-ink border border-mute text-paper p-1" placeholder="5.00" />
        <label className="text-[10px] text-dim block mt-3">Note (optional, ≤200 chars)</label>
        <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-ink border border-mute text-paper p-1" placeholder="e.g. strawberry shortage" />
        {err && <div className="text-scream text-[11px] mt-2">{err}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setOpen(false)} className="text-[10px] uppercase tracking-wider text-dim px-2 py-1">cancel</button>
          <button onClick={submit} disabled={status === "sending"} className="text-[10px] uppercase tracking-wider bg-paper text-ink px-2 py-1 disabled:opacity-50">
            {status === "sending" ? "setting…" : "set"}
          </button>
        </div>
        <div className="text-[9px] text-dim mt-3 italic">
          Agents see your target in their prompts for the next 10 minutes. They don&apos;t have to trade — it&apos;s a public signal.
        </div>
      </div>
    </div>
  );
}
