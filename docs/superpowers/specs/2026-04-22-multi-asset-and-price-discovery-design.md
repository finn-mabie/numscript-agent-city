# Multi-asset ledgering + visitor-driven price discovery

> Design spec. Implementation plans (Plan 8 + Plan 9) to follow the normal spec → plan → execute cadence.

## 1. Summary

Two tightly-coupled features that, together, turn the city from "watch 10 agents transact USD" into "watch a live mini-economy respond to you."

**Phase 1 — multi-asset plumbing (Plan 8).** Agents trade not only USD but also EUR, STRAWBERRIES, and COMPUTE_HOUR. Formance Ledger is asset-agnostic by design — this feature exists mostly to showcase that, *not* to add financial complexity.

**Phase 2 — price discovery (Plan 9).** A visitor sets a "target price" for an asset (e.g., "strawberries are now \$5/unit until 9pm"). Agents see the target vs the live market price (computed as trailing-window VWAP over recent trades) and arbitrage the gap. The visitor watches the market self-correct on-ledger, with a live price sparkline in the HUD.

Combined they become **"set a price, watch the market react"** — a viral, visceral demo of programmable ledger + agent behavior + market mechanics.

## 2. Why together

Multi-asset without price discovery is just a wider ledger — cool for a ledger screenshot but not interactive. Price discovery without multi-assets is impossible — you can't have a price curve with only one asset. Together they produce the first interaction where the visitor directly drives agent behavior in a way that's *legibly reflected on the ledger*.

## 3. Goals

- **Demonstrate Formance's asset-agnostic design** — USD and STRAWBERRIES flow through the same Numscript templates, same `source=` / `destination=` syntax, same auditability, zero special-casing.
- **Make scarcity + demand visible** — only 200 STRAWBERRIES exist in the whole city; you can watch Frank hoard them, Grace trade art for them, and the visitor nudge the market with a pricing shock.
- **Create a new interactive primitive** — "visitor sets price → agents react → ledger records" is the kind of interaction that turns a 30-second Twitter clip into a minute-long engagement.

## 4. Non-negotiable invariants

1. Every Numscript template continues to work across all assets — no per-asset template variants unless semantically needed. A `p2p_transfer` that moves STRAWBERRIES looks identical to one that moves USD except for the `asset` field.
2. The 4-layer safety cage fires identically for any asset. Overdraft, schema validation, authorization guard, and ledger enforcement are asset-invariant.
3. Visitor price-setting is itself rate-limited + sentinel-neutralized + persisted with hashed IP, just like arena prompts.
4. Price signals are **informational context only** for agents. Agents aren't forced into particular trades; they read the price and decide. The market price emerges from their behavior, not from the visitor's target.
5. No asset is minted outside the genesis seed + explicit reseed command. The visitor cannot inject new units of any asset — only nudge agents via target-price signals.

## 5. Data model

### 5.1 Asset registry (Plan 8)

New sqlite table `assets`:

```sql
CREATE TABLE IF NOT EXISTS assets (
  code           TEXT PRIMARY KEY,           -- "USD/2", "EUR/2", "STRAWBERRY/0", "COMPUTE_HOUR/0"
  label          TEXT NOT NULL,              -- "US Dollar", "Strawberry", etc.
  emoji          TEXT,                       -- "🇺🇸", "🍓", "🇪🇺", "💻"
  hex            TEXT NOT NULL,              -- coin-trail color in UI
  decimals       INTEGER NOT NULL,           -- 2 for currencies, 0 for commodities
  unit_label     TEXT NOT NULL,              -- "$", "€", "str", "hr"
  is_currency    INTEGER NOT NULL DEFAULT 0, -- 1 for fiat, 0 for commodity
  total_supply   INTEGER                     -- nullable; used for scarce commodities
);
```

Seed at genesis:

| code | label | emoji | decimals | supply |
|---|---|---|---|---|
| `USD/2` | US Dollar | 🇺🇸 | 2 | (no cap) |
| `EUR/2` | Euro | 🇪🇺 | 2 | (no cap) |
| `STRAWBERRY/0` | Strawberries | 🍓 | 0 | 200 (scarce) |
| `COMPUTE_HOUR/0` | Compute Hour | 💻 | 0 | 50 (scarce) |

### 5.2 Price-signals table (Plan 9)

New sqlite table `price_signals`:

```sql
CREATE TABLE IF NOT EXISTS price_signals (
  id              TEXT PRIMARY KEY,          -- "ps_<base36ts>_<hex4>"
  asset_code      TEXT NOT NULL,             -- "STRAWBERRY/0"
  target_price    INTEGER NOT NULL,          -- per-unit price in USD/2 minor (cents)
  set_by_ip_hash  TEXT NOT NULL,
  set_at          INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,          -- default set_at + 10 min
  note            TEXT,                      -- optional visitor note ("I'll pay 2x")
  FOREIGN KEY (asset_code) REFERENCES assets(code)
);

CREATE INDEX idx_price_signals_active ON price_signals(asset_code, expires_at DESC);
```

Only the most recent non-expired signal per asset is considered "active" — visitors can overwrite their own or each other's signals. Signal ownership is per-IP-hash so one visitor doesn't hold the market.

### 5.3 Market VWAP (Plan 9 — computed on read)

No new table. The backend computes VWAP on demand:
- Query last N (≈20) `p2p_transfer` or `commodity_swap` txs for the asset within the last M (≈5 min) via Formance's `/transactions` endpoint filtered by asset
- Weighted average of `amount / unit_count` across those txs
- Exposed via `GET /market/:asset`

## 6. New templates

### 6.1 `commodity_swap` (Plan 8)

Barter template — A gives X units of asset1, B gives Y units of asset2, atomic.

```
vars {
  account  $agent_a
  account  $agent_b
  monetary $give      // from A
  monetary $take      // from B
  string   $swap_ref  // unique reference
}

send $give (
  source      = $agent_a
  destination = $agent_b
)
send $take (
  source      = $agent_b
  destination = $agent_a
)

set_tx_meta("type", "COMMODITY_SWAP")
set_tx_meta("swap_ref", $swap_ref)
```

Auth: both `agent_a` and `agent_b` are self-owned — but only one agent can initiate, and only `agent_a` is required to be the acting agent's account. (The other side implicitly consents via the LLM having chosen to do the swap — the 4-layer cage still enforces that B's balance must cover the take.)

### 6.2 Existing templates — asset-agnostic already

All 13 existing templates (p2p_transfer, gig_settlement, etc.) already accept an `asset` field inside their `monetary` params. No changes needed — they just start working with EUR / STRAWBERRIES once the asset is in the registry and agents reference it.

## 7. Agent behavior

### 7.1 Tick context (Plan 8 + Plan 9)

`buildContext` gains:

```
Your balances (by asset):
  USD/2:         $10.32
  EUR/2:         €5.00
  STRAWBERRY/0:  3 🍓
  COMPUTE_HOUR/0: 0 💻

Market prices (last 5 min VWAP, trailing):
  🍓 STRAWBERRY: $1.20 / unit     (target: $5.00 until 8:45pm — driven by visitor)
  💻 COMPUTE_HOUR: $8.00 / hr     (no target — market rate)
  €1 EUR ≈ $1.08 USD              (from recent swaps)

Scarcity:
  🍓 STRAWBERRY: 47/200 circulating (6 held by Frank, 12 by Heidi's pool)
  💻 COMPUTE_HOUR: 50/50 available (no scarcity pressure)
```

Injected before the "What's your next move?" line. Clear, tabular, sub-100-tokens.

### 7.2 Agent affiliations (Plan 8)

Light flavor layer — each agent has an **asset preference** that biases their offers:

| Agent | Preferred assets |
|---|---|
| Alice (Market-Maker) | All currencies — quotes spreads |
| Bob (Courier) | Accepts any asset for gig fees |
| Dave (Lender) | USD / EUR only; no commodity credit lines in v1 |
| Eve (Researcher) | Will accept COMPUTE_HOUR as payment |
| Frank (Writer) | Accepts STRAWBERRY tips (flavor) |
| Grace (Illustrator) | STRAWBERRY or COMPUTE_HOUR tips |
| Heidi (Pool-Keeper) | Runs a STRAWBERRY yield pool |
| Ivan (Disputant) | USD only |
| Judy (Red Agent) | Probes cross-asset attacks (e.g., try to swap €10 for $1M) |

Stored as a static `AGENT_ASSET_PREF` map alongside `AGENT_TEMPLATE_MAP`.

### 7.3 Price-responsive behavior (Plan 9)

No agent is "told what to do." The prompt simply exposes the target/market gap, and agents respond in character:

- **Alice (Market-Maker)** arbitrages — if market STRAWBERRY = $1.20 but target = $5.00, Alice buys from Heidi's pool and sells to anyone willing to pay near target.
- **Heidi (Pool-Keeper)** raises her pool rate when VWAP diverges from target — her offers become "Depositing to pool now yields 8% instead of 4%."
- **Frank** hoards (writes offers refusing to swap STRAWBERRIES below target).
- **Judy** does adversarial trades at outsize amounts to probe the price model.

## 8. UI — Glyph surface (Plan 8 + 9)

### 8.1 Coin-trail colors per asset

The existing tx-commit walk/halo/delta choreography already shows $ amounts. Extend with:

- Payer/payee halos tinted by the asset's hex
- Delta labels show the asset unit: `−5 🍓`, `+€2.00`, `−$0.50`
- Coin-trail particles use the asset's hex color

### 8.2 Price ticker in bottom rail (Plan 9)

Replace the existing `TX/MIN` readout with an asset-price mini-ticker:

```
🍓 $1.20 ↑ ⚠ target $5.00   💻 $8.00 —   €/$ 1.08 ↓   TX/MIN 32.5
```

Each asset shows: emoji + current VWAP + direction arrow + optional target warning. The arrow compares against 60s-prior VWAP.

### 8.3 Price-signal setter (Plan 9)

New visitor surface — a tiny HUD button "🎯 Set a price" opens a modal:

```
Set a target price for an asset
┌──────────────────────────────┐
│ Asset:      [🍓 STRAWBERRY ▼] │
│ Target:     $ [____]          │
│ Duration:   [10 min ▼]        │
│ Note:       [_________]       │
│                               │
│           [cancel]  [set]     │
└──────────────────────────────┘
```

On submit: POST `/market/:asset/signal` with rate-limit 2/5min/IP and text-neutralize the note. Backend persists to `price_signals`, broadcasts a WS `price-signal-set` event, agents see the updated target on their next tick.

### 8.4 Live price sparkline (Plan 9)

A tiny 80×24 sparkline in the bottom rail per asset showing the last ~30 VWAP samples. When a target is set, a dotted horizontal line shows the target. Watching the curve converge toward the target is the money shot.

### 8.5 AgentPanel per-asset balances (Plan 8)

Current balance shown in the header is `$X.XX`. Replace with a small table:

```
Balances:
  USD/2          $12.34
  EUR/2          €5.00
  STRAWBERRY/0   0 🍓
```

## 9. Events

Two new WS event kinds in Plan 9:

- `price-signal-set` — `data: { signalId, assetCode, targetPrice, expiresAt, ipHash }`. Agents + UI both consume.
- `price-vwap-update` — `data: { assetCode, vwap, samples, asOf }`. Emitted every 30s by a backend ticker so UI sparklines update even when no trades are happening.

## 10. Safety (Plan 9 visitor input)

Mirrors arena (Plan 4):
- Rate-limited 2 signals / 5 min / IP (hashed salt, same as arena)
- Target price capped at 1000× current VWAP — stops "$1M per strawberry" griefing
- Duration capped at 60 min
- Note text ≤200 chars, sentinel-neutralized, never stored raw
- Active signal is advisory — the visitor cannot force any agent to trade

## 11. Scope split

### Plan 8 — multi-asset plumbing (MVP ~1 day)

1. Assets table + seed genesis with USD, EUR, STRAWBERRY, COMPUTE_HOUR
2. `commodity_swap` template + schema + example
3. `AGENT_ASSET_PREF` map + roster taglines tweaked
4. Context-builder: per-asset balances + preferences block
5. Glyph scene: coin-trail color + delta unit by asset
6. AgentPanel: per-asset balance table
7. Tests: assets migration, new template validates, tick tests with STRAWBERRY

### Plan 9 — price discovery (~1.5 days)

1. `price_signals` table + signalRepo + migration
2. Backend VWAP computation + `GET /market/:asset` endpoint
3. `POST /market/:asset/signal` with rate limit + validation
4. WS events: `price-signal-set`, `price-vwap-update`
5. Context-builder: market-prices + target block
6. Visitor HUD: "🎯 Set a price" button + modal
7. Bottom-rail price ticker + sparkline component
8. Tests: signal endpoint, rate limit, VWAP computation, agents read target in context

## 12. Success criteria

### Plan 8
- All 4 assets circulate in the city within 2 minutes of boot
- A STRAWBERRY-for-USD commodity_swap commits between at least two agents
- AgentPanel shows per-asset balances; coin-trail colors match asset palette

### Plan 9
- Visitor sets a price signal for STRAWBERRY
- Within 2-3 ticks, the market VWAP shifts toward (not exactly TO) the target as agents arbitrage
- Price sparkline in bottom rail visibly moves
- Setting an extreme target (1000× VWAP) is clipped by the cap
- Signal expires and market returns to natural rate after duration

## 13. Open questions

- **Do we need a proper commodity receipt ledger account pattern** (like `@warehouse:frank:strawberries`) or just trust per-agent accounts? Leaning per-agent accounts for simplicity.
- **Should the market VWAP include pool rebalances**, or only peer-to-peer trades? Peer-only for "real market," pool rebalances tracked separately.
- **How does Judy interact with price targets?** She probably tries to game them (sell her STRAWBERRY tiny-unit at the target price without having any — cage catches at commit). Spec-time flavor.
- **Is this where we introduce a `warehouse` building** as a 7th zone for STRAWBERRY storage? Could be fun. Could also fit into existing zones.

## 14. Why this is worth building

Three reasons, in order of importance:

1. **It's a Formance differentiator**. Every fintech demo in 2026 is USD-only. Showing "same ledger primitives, any asset, visible on-screen" is a 30-second Twitter clip.
2. **It's the first truly interactive visitor surface.** The arena lets visitors prompt-inject agents; this lets visitors nudge the *market*. That's much harder to misuse (rate-limited, clipped) and much more satisfying (see your $5 target visibly pull the curve).
3. **It unlocks follow-on demos**. Once assets exist, you can add:
   - Exchange rates + arbitrage between EUR and USD
   - Seasonal supply shocks ("winter: strawberries halved")
   - Auction mechanics on commodities
   - Multi-asset escrow + disputes

The groundwork matters more than any single feature on top of it.
