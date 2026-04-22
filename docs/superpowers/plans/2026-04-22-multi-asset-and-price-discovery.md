# Multi-asset + Price Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 8 adds multi-asset ledgering (USD, EUR, STRAWBERRY, COMPUTEHOUR) with a new `commodity_swap` template and asset-aware visuals. Phase 9 layers on top: visitor sets a target price for an asset, backend computes live VWAP from real trades, agents arbitrage the gap, UI shows a price ticker with sparklines.

**Architecture:** Plan 8 = static asset registry + tick context shows per-asset balances + agents' LLM prompts gain asset preferences + Glyph scene colors coin trails/deltas per asset. Plan 9 = `price_signals` table + `POST /market/:asset/signal` endpoint with rate limits + backend VWAP ticker + two new WS events (`price-signal-set`, `price-vwap-update`) + HUD "🎯 Set a price" modal + bottom-rail sparkline.

**Tech Stack:** Existing — Node 22 / TypeScript orchestrator, better-sqlite3, Next.js 15 / React 19 / Phaser 3. Formance Ledger v2 on Cloud (`nac-city`). No new third-party deps.

**Scope boundary:** This plan ships both phases. Phase 8 is shippable on its own (stop after Task 12). Phase 9 depends on Phase 8. Spec: `docs/superpowers/specs/2026-04-22-multi-asset-and-price-discovery-design.md`.

---

## Prerequisites

- Plans 1-7 complete. `pnpm city:start` emits WS events, Glyph city at `/`, agents transacting.
- Formance `nac-city` ledger already created on Cloud; OAuth creds in `.env`.
- `pnpm rebalance` available when wealth concentrates.

---

## Non-negotiable safety invariants (from spec §4)

1. Every existing template continues to work across all assets (asset-agnostic).
2. The 4-layer cage fires identically regardless of asset.
3. Visitor price-setting is rate-limited + sentinel-neutralized + hashed-IP persisted.
4. Price signals are informational context only — agents choose to react; not forced.
5. No asset is minted outside the genesis seed + explicit reseed.

---

## File structure

**Phase 8 (multi-asset):**

- Create: `packages/orchestrator/migrations/005_assets.sql`
- Create: `packages/orchestrator/src/assets.ts` — static `ASSET_REGISTRY` + helpers
- Create: `templates/commodity_swap/{template.num,schema.json,example.json,README.md}`
- Modify: `scripts/seed-genesis.ts` — seed all 4 assets + per-agent starting balances
- Modify: `packages/orchestrator/src/context-builder.ts` — per-asset balances block + preferences
- Modify: `packages/orchestrator/src/agent-templates-map.ts` — add asset preferences map
- Modify: `packages/orchestrator/src/auth.ts` — add `commodity_swap` self-ownership entry
- Modify: `packages/orchestrator/cli/run-city.ts` — fetch per-asset balances for context
- Modify: `apps/web/src/glyph/store-adapter.ts` — derive asset from tx, pass to commit event
- Modify: `apps/web/src/glyph/scene.ts` — per-asset color for halo/delta/coin trail
- Modify: `apps/web/src/components/AgentPanel.tsx` — per-asset balance table
- Tests for each of the above

**Phase 9 (price discovery):**

- Create: `packages/orchestrator/migrations/006_price_signals.sql`
- Create: `packages/orchestrator/src/price-signals.ts` — id generator, validator
- Modify: `packages/orchestrator/src/repositories.ts` — add `priceSignalRepo`
- Modify: `packages/orchestrator/src/http.ts` — `POST /market/:asset/signal` + `GET /market/:asset`
- Create: `packages/orchestrator/src/vwap.ts` — compute trailing VWAP from ledger txs
- Modify: `packages/orchestrator/src/types.ts` — add `price-signal-set` + `price-vwap-update` event kinds
- Modify: `apps/web/src/lib/event-schema.ts` — mirror events
- Modify: `packages/orchestrator/cli/run-city.ts` — background VWAP ticker, emit events
- Modify: `packages/orchestrator/src/context-builder.ts` — "Market prices" block
- Modify: `apps/web/src/state/city-store.ts` — `prices` + `signals` slices
- Modify: `apps/web/src/glyph/store-adapter.ts` — translate price events
- Create: `apps/web/src/components/PriceSignalModal.tsx` — visitor UI
- Create: `apps/web/src/glyph/hud/PriceTicker.tsx` — bottom-rail sparkline
- Modify: `apps/web/src/glyph/GlyphStage.tsx` — mount modal + ticker

---

## Phase 8 — Multi-asset plumbing

Ships as a standalone increment. After Task 12 the city transacts in USD, EUR, STRAWBERRY, COMPUTEHOUR end-to-end; Phase 9 can follow later.

---

### Task 1: Asset registry — `assets.ts` + migration + seed

**Files:**
- Create: `packages/orchestrator/migrations/005_assets.sql`
- Create: `packages/orchestrator/src/assets.ts`
- Create: `packages/orchestrator/test/assets.test.ts`
- Modify: `packages/orchestrator/test/db.test.ts` (bump count 4→5, add `assets` to expected tables)

- [ ] **Step 1.1: Write failing test**

Create `packages/orchestrator/test/assets.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ASSET_REGISTRY, assetByCode, formatAmount, isCommodity } from "../src/assets.js";

describe("ASSET_REGISTRY", () => {
  it("seeds USD, EUR, STRAWBERRY, COMPUTEHOUR", () => {
    expect(ASSET_REGISTRY.map((a) => a.code).sort()).toEqual([
      "COMPUTEHOUR/0", "EUR/2", "STRAWBERRY/0", "USD/2"
    ]);
  });
  it("USD has 2 decimals; STRAWBERRY has 0", () => {
    expect(assetByCode("USD/2")?.decimals).toBe(2);
    expect(assetByCode("STRAWBERRY/0")?.decimals).toBe(0);
  });
  it("scarce commodities have totalSupply; currencies don't", () => {
    expect(assetByCode("USD/2")?.totalSupply).toBeNull();
    expect(assetByCode("STRAWBERRY/0")?.totalSupply).toBe(200);
    expect(assetByCode("COMPUTEHOUR/0")?.totalSupply).toBe(50);
  });
});

describe("formatAmount", () => {
  it("USD → $1.23", () => {
    expect(formatAmount("USD/2", 123)).toBe("$1.23");
  });
  it("EUR → €0.05", () => {
    expect(formatAmount("EUR/2", 5)).toBe("€0.05");
  });
  it("STRAWBERRY → 3 🍓", () => {
    expect(formatAmount("STRAWBERRY/0", 3)).toBe("3 🍓");
  });
  it("COMPUTEHOUR → 2 💻", () => {
    expect(formatAmount("COMPUTEHOUR/0", 2)).toBe("2 💻");
  });
  it("unknown asset falls back to raw", () => {
    expect(formatAmount("MYSTERY/9", 42)).toBe("42 MYSTERY/9");
  });
});

describe("isCommodity", () => {
  it("STRAWBERRY is commodity, USD is not", () => {
    expect(isCommodity("STRAWBERRY/0")).toBe(true);
    expect(isCommodity("USD/2")).toBe(false);
  });
});
```

- [ ] **Step 1.2: Run — expect fail**

```bash
cd /Users/finnmabie/Documents/numscript-agent-city && pnpm --filter @nac/orchestrator test -- --run assets
```

Expected: module not found.

- [ ] **Step 1.3: Implement `assets.ts`**

```typescript
// packages/orchestrator/src/assets.ts
export interface Asset {
  code: string;           // "USD/2", "STRAWBERRY/0"
  label: string;
  emoji: string;
  hex: string;
  decimals: number;
  unitLabel: string;      // "$", "€", "str", "hr"
  prefix: boolean;        // true: "$12.34"; false: "3 🍓"
  isCurrency: boolean;
  totalSupply: number | null;
}

export const ASSET_REGISTRY: Asset[] = [
  { code: "USD/2",          label: "US Dollar",     emoji: "🇺🇸", hex: "#BAEABC", decimals: 2, unitLabel: "$", prefix: true,  isCurrency: true,  totalSupply: null },
  { code: "EUR/2",          label: "Euro",          emoji: "🇪🇺", hex: "#8CB8D6", decimals: 2, unitLabel: "€", prefix: true,  isCurrency: true,  totalSupply: null },
  { code: "STRAWBERRY/0",   label: "Strawberry",    emoji: "🍓", hex: "#F5B8C8", decimals: 0, unitLabel: "🍓", prefix: false, isCurrency: false, totalSupply: 200 },
  { code: "COMPUTEHOUR/0", label: "Compute Hour",  emoji: "💻", hex: "#60D6CE", decimals: 0, unitLabel: "💻", prefix: false, isCurrency: false, totalSupply: 50 }
];

const BY_CODE = new Map(ASSET_REGISTRY.map((a) => [a.code, a]));

export function assetByCode(code: string): Asset | undefined {
  return BY_CODE.get(code);
}

export function isCommodity(code: string): boolean {
  return !!BY_CODE.get(code) && BY_CODE.get(code)!.isCurrency === false;
}

/**
 * Format a minor-units amount for human display. Currencies use prefix
 * symbols ("$1.23"); commodities use suffix ("3 🍓"). Unknown assets
 * fall back to "<amount> <code>".
 */
export function formatAmount(code: string, minorAmount: number): string {
  const a = BY_CODE.get(code);
  if (!a) return `${minorAmount} ${code}`;
  const value = a.decimals === 0
    ? String(minorAmount)
    : (minorAmount / Math.pow(10, a.decimals)).toFixed(a.decimals);
  return a.prefix ? `${a.unitLabel}${value}` : `${value} ${a.unitLabel}`;
}
```

- [ ] **Step 1.4: Create migration `005_assets.sql`**

```sql
CREATE TABLE IF NOT EXISTS assets (
  code         TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  emoji        TEXT,
  hex          TEXT NOT NULL,
  decimals     INTEGER NOT NULL,
  unit_label   TEXT NOT NULL,
  is_currency  INTEGER NOT NULL DEFAULT 0,
  total_supply INTEGER
);

INSERT OR IGNORE INTO assets (code, label, emoji, hex, decimals, unit_label, is_currency, total_supply) VALUES
  ('USD/2',          'US Dollar',     '🇺🇸', '#BAEABC', 2, '$',  1, NULL),
  ('EUR/2',          'Euro',          '🇪🇺', '#8CB8D6', 2, '€',  1, NULL),
  ('STRAWBERRY/0',   'Strawberry',    '🍓', '#F5B8C8', 0, '🍓', 0, 200),
  ('COMPUTEHOUR/0', 'Compute Hour',  '💻', '#60D6CE', 0, '💻', 0, 50);
```

- [ ] **Step 1.5: Run — expect pass**

```bash
pnpm --filter @nac/orchestrator test -- --run assets
```

Expected: 9 passing.

- [ ] **Step 1.6: Update db.test.ts**

Bump the migration count from 4 to 5, add `"assets"` to the expected-tables `arrayContaining` array.

Run:

```bash
pnpm --filter @nac/orchestrator test -- --run db
```

- [ ] **Step 1.7: Export from index**

In `packages/orchestrator/src/index.ts`, add:

```typescript
export { ASSET_REGISTRY, assetByCode, formatAmount, isCommodity } from "./assets.js";
export type { Asset } from "./assets.js";
```

- [ ] **Step 1.8: Commit**

```bash
git add packages/orchestrator/migrations/005_assets.sql \
        packages/orchestrator/src/assets.ts \
        packages/orchestrator/src/index.ts \
        packages/orchestrator/test/assets.test.ts \
        packages/orchestrator/test/db.test.ts
git commit -m "feat(assets): asset registry — USD, EUR, STRAWBERRY, COMPUTEHOUR"
```

---

### Task 2: Seed non-USD assets in genesis

**Files:**
- Modify: `scripts/seed-genesis.ts`

Seed each agent with starting balances in all 4 assets. Use a unique reference per asset so it's idempotent across `seed-genesis` runs.

- [ ] **Step 2.1: Extend `seed-genesis.ts`**

Read the file first. Currently seeds each agent with `$100 USD/2` via `genesis:agents:NNN:available`. Add three more loops after the existing USD loop (before the platform-treasury seed):

```typescript
// EUR — every agent starts with €50
for (const id of agents) {
  const ref = `genesis:eur:agents:${id}:available`;
  const r = await client.commit({
    plain: `send [EUR/2 5000] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = ${agentAvailable(id)}
)
set_tx_meta("type", "GENESIS_SEED")
set_tx_meta("agent", "${id}")
set_tx_meta("asset", "EUR/2")`,
    vars: {},
    reference: ref
  });
  if (r.ok) console.log(`✓ seeded €50 to agent ${id}`);
  else       console.error(`seed eur ${id}: ${r.code} ${r.message}`);
}

// STRAWBERRY — scarce, only 200 total. Distribute unevenly:
// Heidi (pool) = 60, Frank (writer, tips) = 40, Grace (illustrator, tips) = 30,
// Alice (market) = 20, Bob (courier) = 20, remaining agents = 6 each (5×6=30)
const strawberryAllocation: Record<string, number> = {
  "001": 20, "002": 20, "003": 6, "004": 6, "005": 6,
  "006": 40, "007": 30, "008": 60, "009": 6, "010": 6
};
for (const id of agents) {
  const amount = strawberryAllocation[id] ?? 0;
  if (amount === 0) continue;
  const ref = `genesis:strawberry:agents:${id}:available`;
  const r = await client.commit({
    plain: `send [STRAWBERRY/0 ${amount}] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = ${agentAvailable(id)}
)
set_tx_meta("type", "GENESIS_SEED")
set_tx_meta("agent", "${id}")
set_tx_meta("asset", "STRAWBERRY/0")`,
    vars: {},
    reference: ref
  });
  if (r.ok) console.log(`✓ seeded ${amount} 🍓 to agent ${id}`);
  else       console.error(`seed strawberry ${id}: ${r.code} ${r.message}`);
}

// COMPUTEHOUR — also scarce (50 total). Eve (researcher) gets most.
const computeAllocation: Record<string, number> = {
  "005": 30, "006": 5, "007": 5, "008": 5, "001": 5
};
for (const id of agents) {
  const amount = computeAllocation[id] ?? 0;
  if (amount === 0) continue;
  const ref = `genesis:compute:agents:${id}:available`;
  const r = await client.commit({
    plain: `send [COMPUTEHOUR/0 ${amount}] (
  source      = @mint:genesis allowing unbounded overdraft
  destination = ${agentAvailable(id)}
)
set_tx_meta("type", "GENESIS_SEED")
set_tx_meta("agent", "${id}")
set_tx_meta("asset", "COMPUTEHOUR/0")`,
    vars: {},
    reference: ref
  });
  if (r.ok) console.log(`✓ seeded ${amount} 💻 to agent ${id}`);
  else       console.error(`seed compute ${id}: ${r.code} ${r.message}`);
}
```

- [ ] **Step 2.2: Run seed + verify**

```bash
pnpm seed-genesis 2>&1 | tail -30
```

Expected output includes "✓ seeded €50 to agent 001"…"✓ seeded 60 🍓 to agent 008" etc.

Verify via ledger API:

```bash
curl -s "http://127.0.0.1:3071/agent/008" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('Heidi volumes:')
# Volumes only surface via the Formance API directly; the snapshot-endpoint
# currently returns USD only. We'll fix per-asset balances in Task 7.
print('metadata:', d.get('metadata'))
"
```

(The snapshot endpoint still shows USD balance only — Task 7 adds per-asset.)

- [ ] **Step 2.3: Commit**

```bash
git add scripts/seed-genesis.ts
git commit -m "feat(assets): seed EUR, STRAWBERRY, COMPUTEHOUR at genesis"
```

---

### Task 3: `commodity_swap` template

**Files:**
- Create: `templates/commodity_swap/template.num`
- Create: `templates/commodity_swap/schema.json`
- Create: `templates/commodity_swap/example.json`
- Create: `templates/commodity_swap/README.md`
- Modify: `packages/orchestrator/src/auth.ts` (register self-ownership)

- [ ] **Step 3.1: Write Numscript template**

Create `templates/commodity_swap/template.num`:

```numscript
vars {
  account  $agent_a
  account  $agent_b
  monetary $give
  monetary $take
  string   $swap_ref
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

- [ ] **Step 3.2: Write schema**

Create `templates/commodity_swap/schema.json`:

```json
{
  "id": "commodity_swap",
  "description": "Atomic barter between two agents. A gives $give to B; B gives $take to A. Both sides must have sufficient balance. Used for crossing asset boundaries (USD ↔ STRAWBERRY, EUR ↔ USD, etc.).",
  "params": {
    "agent_a":  { "type": "account",  "pattern": "^@agents:[0-9]{3}:available$" },
    "agent_b":  { "type": "account",  "pattern": "^@agents:[0-9]{3}:available$" },
    "give":     { "type": "monetary", "max": "10000_00", "min": "1" },
    "take":     { "type": "monetary", "max": "10000_00", "min": "1" },
    "swap_ref": { "type": "string",   "maxLength": 140 }
  }
}
```

Note: no `asset` const — any asset code accepted on either side.

- [ ] **Step 3.3: Write example**

Create `templates/commodity_swap/example.json`:

```json
{
  "agent_a":  "@agents:001:available",
  "agent_b":  "@agents:007:available",
  "give":     { "asset": "USD/2", "amount": 500 },
  "take":     { "asset": "STRAWBERRY/0", "amount": 3 },
  "swap_ref": "alice-grace-strawberry-2026-04-22"
}
```

- [ ] **Step 3.4: Write README**

Create `templates/commodity_swap/README.md`:

```markdown
# commodity_swap

Atomic barter between two agents. Useful for crossing asset boundaries.

## Example

Alice (USD-holder) buys 3 🍓 from Grace for $5:

    agent_a = Alice, agent_b = Grace
    give = USD/2 500     ← Alice gives
    take = STRAWBERRY/0 3 ← Grace gives

Commits atomically — both sides move, or neither.

## Safety

- Both agents' balances are source-bounded (Numscript enforces at ledger level).
- `agent_a` must be the acting agent (self-ownership checked in auth.ts).
- The other side (`agent_b`) implicitly consents by having their LLM not post
  a counter-offer in a previous tick. For explicit negotiation before swap,
  agents should DM first and reference the `swap_ref` in the DM.
```

- [ ] **Step 3.5: Register self-ownership in `auth.ts`**

In `packages/orchestrator/src/auth.ts`, add to `SELF_OWNED_PARAMS`:

```typescript
  commodity_swap:      ["agent_a"],
```

(Only `agent_a` is checked — `agent_b` on the other side is not the initiator, but their balance is still source-bounded by the ledger so they can't be drained.)

- [ ] **Step 3.6: Validate template via CI tooling**

```bash
pnpm validate-templates 2>&1 | tail -10
```

Expected: commodity_swap passes Numscript playground validation (script runs against Formance's playground API).

- [ ] **Step 3.7: Commit**

```bash
git add templates/commodity_swap/ packages/orchestrator/src/auth.ts
git commit -m "feat(assets): commodity_swap template (atomic two-sided barter)"
```

---

### Task 4: Agent asset preferences map

**Files:**
- Modify: `packages/orchestrator/src/agent-templates-map.ts`
- Create: `packages/orchestrator/test/agent-templates-map.test.ts`

- [ ] **Step 4.1: Write failing test**

Create `packages/orchestrator/test/agent-templates-map.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AGENT_TEMPLATE_MAP, AGENT_ASSET_PREF } from "../src/agent-templates-map.js";

describe("AGENT_ASSET_PREF", () => {
  it("every agent has at least one preferred asset", () => {
    for (const id of Object.keys(AGENT_TEMPLATE_MAP)) {
      expect(AGENT_ASSET_PREF[id]).toBeTruthy();
      expect(AGENT_ASSET_PREF[id].length).toBeGreaterThan(0);
    }
  });
  it("Alice prefers currencies only", () => {
    expect(AGENT_ASSET_PREF["001"]).toEqual(["USD/2", "EUR/2"]);
  });
  it("Grace accepts STRAWBERRY + COMPUTEHOUR (creative-tips flavor)", () => {
    expect(AGENT_ASSET_PREF["007"]).toContain("STRAWBERRY/0");
    expect(AGENT_ASSET_PREF["007"]).toContain("COMPUTEHOUR/0");
  });
  it("Dave is USD/EUR only — no commodity credit", () => {
    expect(AGENT_ASSET_PREF["004"]).toEqual(["USD/2", "EUR/2"]);
  });
});
```

- [ ] **Step 4.2: Run — expect fail**

```bash
pnpm --filter @nac/orchestrator test -- --run agent-templates-map
```

- [ ] **Step 4.3: Add map**

Append to `packages/orchestrator/src/agent-templates-map.ts`:

```typescript
/**
 * Asset-preference hints injected into each agent's system prompt. Agents
 * are told these are the assets they "care about" — they'll be biased to
 * price offers in these, accept tips in these, etc. Not enforced at the
 * template layer — just a flavor nudge.
 */
export const AGENT_ASSET_PREF: Record<string, string[]> = {
  "001": ["USD/2", "EUR/2"],                              // Alice — market-maker, currencies
  "002": ["USD/2", "EUR/2", "STRAWBERRY/0"],              // Bob — takes anything as gig fee
  "003": ["USD/2", "EUR/2"],                              // Carol — fees in currency
  "004": ["USD/2", "EUR/2"],                              // Dave — no commodity credit
  "005": ["USD/2", "COMPUTEHOUR/0"],                     // Eve — accepts compute as payment
  "006": ["USD/2", "STRAWBERRY/0"],                       // Frank — strawberry tips flavor
  "007": ["USD/2", "STRAWBERRY/0", "COMPUTEHOUR/0"],     // Grace — creative tips
  "008": ["USD/2", "STRAWBERRY/0"],                       // Heidi — strawberry yield pool
  "009": ["USD/2", "EUR/2"],                              // Ivan — disputes in currency
  "010": ["USD/2", "EUR/2", "STRAWBERRY/0", "COMPUTEHOUR/0"] // Judy — probes anything
};
```

- [ ] **Step 4.4: Run — expect pass**

```bash
pnpm --filter @nac/orchestrator test -- --run agent-templates-map
```

- [ ] **Step 4.5: Commit**

```bash
git add packages/orchestrator/src/agent-templates-map.ts \
        packages/orchestrator/test/agent-templates-map.test.ts
git commit -m "feat(assets): per-agent asset-preference map"
```

---

### Task 5: Per-asset balance fetcher in template-engine

**Files:**
- Modify: `packages/template-engine/src/ledger-client.ts` — add `getBalancesByAccount(address)` that returns all assets for an account, not just one
- Create: `packages/template-engine/test/ledger-client.balances.test.ts` (only if live ledger available — skip if not)

Current `LedgerClient.getBalance(account, asset)` returns a single asset. We need all assets in one shot.

- [ ] **Step 5.1: Extend `ledger-client.ts`**

Read the file first. After the existing `getBalance` method, add:

```typescript
  /**
   * Returns ALL asset balances for an account in one call. Map keyed by
   * asset code, values are minor units (integer). Empty map on HTTP error.
   */
  async getBalancesByAccount(account: string): Promise<Map<string, number>> {
    const addr = account.startsWith("@") ? account.slice(1) : account;
    const res = await fetch(
      `${this.baseUrl}/v2/${this.ledger}/accounts/${encodeURIComponent(addr)}?expand=volumes`,
      { headers: await this.headers() }
    );
    if (!res.ok) return new Map();
    const body = (await res.json().catch(() => ({}))) as { data?: any } & any;
    const data = body.data ?? body;
    const volumes = data?.volumes ?? {};
    const out = new Map<string, number>();
    for (const [asset, vol] of Object.entries(volumes)) {
      out.set(asset, Number((vol as any)?.balance ?? 0));
    }
    return out;
  }
```

- [ ] **Step 5.2: Build template-engine**

```bash
pnpm --filter @nac/template-engine build
```

Must exit 0.

- [ ] **Step 5.3: Commit**

```bash
git add packages/template-engine/src/ledger-client.ts
git commit -m "feat(engine): getBalancesByAccount — all assets in one call"
```

---

### Task 6: Context-builder per-asset block + asset preferences

**Files:**
- Modify: `packages/orchestrator/src/context-builder.ts`
- Modify: `packages/orchestrator/test/context-builder.test.ts`

- [ ] **Step 6.1: Extend `ContextInput`**

Read `context-builder.ts`. Current `balances: Record<string, number>` is USD-only (keyed by account address). Change the semantics to a nested map keyed by `accountAddress → assetCode → minorAmount`:

Old:
```typescript
  balances: Record<string, number>; // account address → USD/2 minor units
```

New:
```typescript
  /** account address → asset code → minor units. Self balance is balances[@agents:{id}:available]. */
  balancesByAsset: Record<string, Record<string, number>>;
  /** Assets this agent cares about (nudge, not enforcement). */
  preferredAssets?: string[];
```

Delete the old `balances` field. ALL call sites passing the old shape need to be updated (Task 7 does that in `tick.ts`).

- [ ] **Step 6.2: Update `buildContext` to render per-asset**

Replace the existing single-balance line in the `user` assembly. Old:

```typescript
  const selfBalance = balances[availableOf(agent.id)] ?? 0;
  // ...
  `Your current balance: ${fmtUsd(selfBalance)}`,
```

New:

```typescript
  const selfAcct = `@agents:${agent.id}:available`;
  const selfBalancesMap = input.balancesByAsset[selfAcct] ?? {};
  const selfBalance = selfBalancesMap["USD/2"] ?? 0;  // keep for bracket logic below
  const balanceLines = Object.entries(selfBalancesMap)
    .filter(([, amt]) => amt > 0)
    .map(([code, amt]) => `  ${code.padEnd(16)} ${formatAmountLine(code, amt)}`);
  const balancesBlock = balanceLines.length === 0
    ? "  (nothing — you're completely empty)"
    : balanceLines.join("\n");

  const preferredLine = (input.preferredAssets && input.preferredAssets.length > 0)
    ? `\nAssets you care about: ${input.preferredAssets.join(", ")}`
    : "";
```

And helper at module scope:

```typescript
import { formatAmount } from "./assets.js";
function formatAmountLine(code: string, minor: number): string {
  return formatAmount(code, minor);
}
```

In the `user` string assembly, replace the single `Your current balance:` line with:

```typescript
    `Your balances:`,
    balancesBlock,
    preferredLine ? preferredLine.trim() : ``,
    ``,
```

Keep the `DO NOT OVERDRAFT YOURSELF` and `AUTHORIZATION` blocks — they already reference `selfBalance` which now means the USD part specifically. That's intentional — overdraft warning is about USD primarily.

- [ ] **Step 6.3: Update existing context-builder tests**

Read `packages/orchestrator/test/context-builder.test.ts`. Every test currently passes `balances: Record<string, number>` — change all call sites to `balancesByAsset: Record<string, Record<string, number>>` with the single-USD entry wrapped:

Old:
```typescript
  balances: { "@agents:001:available": 100 },
```

New:
```typescript
  balancesByAsset: { "@agents:001:available": { "USD/2": 100 } },
```

Also add ONE new test near the bottom:

```typescript
describe("buildContext with multi-asset balances", () => {
  it("renders all non-zero asset balances", () => {
    const { user } = buildContext({
      agent: { id: "008", name: "Heidi", role: "Pool", tagline: "t", color: "#7FD6A8", nextTickAt: 0, hustleMode: 0 as 0, createdAt: 0, updatedAt: 0 },
      peers: [],
      balancesByAsset: {
        "@agents:008:available": { "USD/2": 10000, "STRAWBERRY/0": 60, "COMPUTEHOUR/0": 5 }
      },
      preferredAssets: ["USD/2", "STRAWBERRY/0"],
      topRel: [], bottomRel: [], recent: []
    });
    expect(user).toContain("Your balances:");
    expect(user).toContain("USD/2");
    expect(user).toContain("$100.00");
    expect(user).toContain("STRAWBERRY/0");
    expect(user).toContain("60 🍓");
    expect(user).toContain("COMPUTEHOUR/0");
    expect(user).toContain("5 💻");
    expect(user).toContain("Assets you care about: USD/2, STRAWBERRY/0");
  });

  it("handles an agent with zero balances everywhere", () => {
    const { user } = buildContext({
      agent: { id: "001", name: "Alice", role: "Market", tagline: "t", color: "#D4A24A", nextTickAt: 0, hustleMode: 0 as 0, createdAt: 0, updatedAt: 0 },
      peers: [],
      balancesByAsset: {},
      topRel: [], bottomRel: [], recent: []
    });
    expect(user).toContain("(nothing — you're completely empty)");
  });
});
```

- [ ] **Step 6.4: Run tests**

```bash
pnpm --filter @nac/orchestrator test -- --run context-builder
```

Expected: all passing.

- [ ] **Step 6.5: Commit**

```bash
git add packages/orchestrator/src/context-builder.ts \
        packages/orchestrator/test/context-builder.test.ts
git commit -m "feat(assets): per-asset balance block + asset preferences in tick context"
```

---

### Task 7: Tick integration — pass per-asset balances + preferences

**Files:**
- Modify: `packages/orchestrator/src/tick.ts`
- Modify: `packages/orchestrator/test/tick.test.ts` (update harness — existing tests use old shape)

- [ ] **Step 7.1: Update the balance-fetch in `tickAgent`**

Read `tick.ts`. Find the existing balance-fetch loop:

```typescript
    const allAgents = ag.list();
    const balances: Record<string, number> = {};
    for (const peer of allAgents) {
      const addr = `@agents:${peer.id}:available`;
      const bal = await deps.ledger.getBalance(addr, "USD/2");
      balances[addr] = bal ?? 0;
    }
    const selfBalance = balances[`@agents:${agent.id}:available`] ?? 0;
```

Replace with per-asset:

```typescript
    const allAgents = ag.list();
    const balancesByAsset: Record<string, Record<string, number>> = {};
    for (const peer of allAgents) {
      const addr = `@agents:${peer.id}:available`;
      const byAsset = await deps.ledger.getBalancesByAccount(addr);
      balancesByAsset[addr] = Object.fromEntries(byAsset.entries());
    }
    const selfBalancesMap = balancesByAsset[`@agents:${agent.id}:available`] ?? {};
    const selfBalance = selfBalancesMap["USD/2"] ?? 0;  // for hustle-mode + overdraft-warning logic
```

- [ ] **Step 7.2: Pass to `buildContext`**

Add at top of file:

```typescript
import { AGENT_TEMPLATE_MAP, AGENT_ASSET_PREF } from "./agent-templates-map.js";
```

Update the `buildContext` call:

```typescript
    const { system, user } = buildContext({
      agent, peers: allAgents, balancesByAsset, topRel, bottomRel, recent,
      arenaInjection: queued?.prompt,
      board,
      dms: dmsList,
      preferredAssets: AGENT_ASSET_PREF[agent.id] ?? ["USD/2"]
    });
```

- [ ] **Step 7.3: Update existing tick tests**

Read `packages/orchestrator/test/tick.test.ts`. The tests don't usually call `buildContext` directly but they mock `LLMClient.pickAction` — no direct balance assertions. Still, the ledger-balance probe inside `tickAgent` now calls `ledger.getBalancesByAccount` instead of `getBalance`. For the existing live-ledger tests that use a real `LedgerClient`, this will just work. For unit tests that use a mock ledger, you may need to add the method.

Search for any `getBalance:` or `getBalance(` in test files:

```bash
grep -rn "getBalance" packages/orchestrator/test/ | head
```

If any tests mock `LedgerClient` with `{ getBalance: async () => ... }`, add `getBalancesByAccount` to the mock too:

```typescript
getBalancesByAccount: async () => new Map([["USD/2", 10000]])
```

- [ ] **Step 7.4: Run all orchestrator tests**

```bash
pnpm --filter @nac/orchestrator test 2>&1 | tail -15
```

Expected: the known pre-existing ledger-balance failures may still fail (unrelated), but no NEW failures from this change.

- [ ] **Step 7.5: Commit**

```bash
git add packages/orchestrator/src/tick.ts packages/orchestrator/test/tick.test.ts
git commit -m "feat(assets): tickAgent fetches + passes per-asset balances"
```

---

### Task 8: `/agent/:id` HTTP endpoint returns per-asset balances

**Files:**
- Modify: `packages/orchestrator/src/http.ts`

- [ ] **Step 8.1: Extend the response**

Read `http.ts`. Find the `/agent/:id` handler — it currently extracts `balance` (USD) from `accountRes.body.volumes["USD/2"]`. Extend to return the full volumes map:

Find this block:

```typescript
        const balance = Number(accountData?.volumes?.["USD/2"]?.balance ?? 0);
        const metadata = accountData?.metadata ?? {};
```

Replace with:

```typescript
        const volumes = accountData?.volumes ?? {};
        const balance = Number(volumes?.["USD/2"]?.balance ?? 0);
        const balancesByAsset: Record<string, number> = {};
        for (const [asset, vol] of Object.entries(volumes)) {
          balancesByAsset[asset] = Number((vol as any)?.balance ?? 0);
        }
        const metadata = accountData?.metadata ?? {};
```

Then in the JSON response, add the map:

```typescript
        return json(res, 200, {
          agent: { ... },
          balance,
          balancesByAsset,
          metadata,
          transactions: ...,
          intentLog: ...
        });
```

(Keep `balance` for backward-compat with existing frontend code paths; frontend uses `balancesByAsset` going forward.)

Also update `/snapshot` response — currently returns `balance: usd_only` per agent. Extend:

```typescript
          const withBalances = await Promise.all(
            agents.map(async (a) => ({
              id: a.id, name: a.name, role: a.role, tagline: a.tagline,
              color: a.color, hustleMode: a.hustleMode,
              balance: (await opts.getBalance(`@agents:${a.id}:available`)) ?? 0,
              balancesByAsset: Object.fromEntries(
                (await opts.getBalancesByAccount?.(`@agents:${a.id}:available`)) ?? new Map()
              )
            }))
          );
```

For this to work, extend `StartHttpOptions`:

```typescript
  /** Optional — returns all asset balances for an account. */
  getBalancesByAccount?: (address: string) => Promise<Map<string, number>>;
```

And pass it from `run-city.ts` (Task 11 below).

- [ ] **Step 8.2: Commit**

```bash
git add packages/orchestrator/src/http.ts
git commit -m "feat(assets): /snapshot + /agent/:id return per-asset balances"
```

---

### Task 9: Frontend web store — per-asset balances + asset events

**Files:**
- Modify: `apps/web/src/state/city-store.ts`
- Modify: `apps/web/src/glyph/store-adapter.ts`

- [ ] **Step 9.1: Extend `AgentView` with per-asset balances**

In `apps/web/src/state/city-store.ts`, extend `AgentView`:

```typescript
export interface AgentView {
  id: string;
  name: string;
  role: string;
  tagline: string;
  color: string;
  balance: number;        // USD/2 for backward compat
  balancesByAsset?: Record<string, number>;  // NEW — full map
  hustleMode: 0 | 1;
  x: number;
  y: number;
}
```

Update `hydrate` to copy `balancesByAsset` from snapshot if present:

```typescript
  hydrate({ agents, recent }) {
    const byId: Record<string, AgentView> = {};
    for (const a of agents) {
      const [x, y] = START_POSITIONS[a.id] ?? [0, 0];
      byId[a.id] = {
        ...a,
        x, y,
        balancesByAsset: (a as any).balancesByAsset ?? undefined
      };
    }
    set({ agents: byId, recent: recent.slice(0, RECENT_CAP) });
  },
```

- [ ] **Step 9.2: Extend `GlyphCommitEvent` with asset code**

In `apps/web/src/glyph/store-adapter.ts`:

```typescript
export interface GlyphCommitEvent {
  id: string; from: string; to: string; amount: number; txid: string;
  asset?: string;  // NEW — e.g. "USD/2", "STRAWBERRY/0"
}
```

Derive asset from `r.params` in the subscriber (add a helper):

```typescript
function assetFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const p = params as Record<string, unknown>;
  // Standard monetary params: `amount`, `give`, `take`, `total`
  for (const key of ["amount", "give", "take", "total"]) {
    const m = p[key];
    if (m && typeof m === "object" && m !== null && "asset" in m) {
      return String((m as { asset: unknown }).asset);
    }
  }
  return undefined;
}
```

In the subscriber loop for `r.outcome === "committed"`, include asset:

```typescript
        emit("commit", {
          id: r.tickId, from: r.agentId, to: peer, amount, txid,
          asset: assetFromParams(r.params)
        } as GlyphCommitEvent);
```

- [ ] **Step 9.3: Commit**

```bash
git add apps/web/src/state/city-store.ts apps/web/src/glyph/store-adapter.ts
git commit -m "feat(assets): web store carries per-asset balances + commit event asset code"
```

---

### Task 10: Glyph scene — asset-aware colors + deltas

**Files:**
- Modify: `apps/web/src/glyph/scene.ts`
- Create: `apps/web/src/glyph/asset-palette.ts` — frontend mirror of `ASSET_REGISTRY` (subset for rendering)

- [ ] **Step 10.1: Create `asset-palette.ts`**

```typescript
// apps/web/src/glyph/asset-palette.ts
// Mirrors packages/orchestrator/src/assets.ts (render-only subset).
// If you change ASSET_REGISTRY on the backend, update this too.

export interface AssetRender {
  hex: string;
  decimals: number;
  unitLabel: string;
  prefix: boolean;  // true → "$1.23"; false → "3 🍓"
}

export const ASSET_PALETTE: Record<string, AssetRender> = {
  "USD/2":          { hex: "#BAEABC", decimals: 2, unitLabel: "$",  prefix: true  },
  "EUR/2":          { hex: "#8CB8D6", decimals: 2, unitLabel: "€",  prefix: true  },
  "STRAWBERRY/0":   { hex: "#F5B8C8", decimals: 0, unitLabel: "🍓", prefix: false },
  "COMPUTEHOUR/0": { hex: "#60D6CE", decimals: 0, unitLabel: "💻", prefix: false }
};

export function formatAmount(code: string | undefined, minorAmount: number): string {
  const a = code ? ASSET_PALETTE[code] : undefined;
  if (!a) return String(minorAmount);
  const value = a.decimals === 0
    ? String(minorAmount)
    : (minorAmount / Math.pow(10, a.decimals)).toFixed(a.decimals);
  return a.prefix ? `${a.unitLabel}${value}` : `${value} ${a.unitLabel}`;
}

export function hexFor(code: string | undefined): string {
  return code && ASSET_PALETTE[code] ? ASSET_PALETTE[code].hex : "#BAEABC";
}
```

- [ ] **Step 10.2: Use asset palette in scene commit flash**

Read `scene.ts`. Find `flashCommit` — currently uses hardcoded gold (`0xd4a24a`) for payer and mint (`0xbaeabc`) for payee. Change the sig to accept the asset and tint the PAYER ring with gold still (money leaves the payer) BUT color the FLOATING DELTA by asset. Receiver ring stays mint.

Update `onCommit` signature to thread `asset` through:

```typescript
  private onCommit({ from, to, amount, txid, asset }: GlyphCommitEvent) {
    // ... existing walk choreography unchanged ...
    // on arrival:
    this.flashCommit(from, to, amount, asset);
```

Update `flashCommit(...)`:

```typescript
  private flashCommit(from: string, to: string, amount: number, asset?: string) {
    const payerS = this.agentSprites.get(from);
    const payeeS = this.agentSprites.get(to);
    if (!payerS) return;

    const assetHex = hexFor(asset);
    const assetHexInt = Phaser.Display.Color.HexStringToColor(assetHex).color;
    const formatted = formatAmount(asset, amount);

    // Halo on payer (gold, money-leaves) — unchanged
    const payerHalo = this.add.circle(payerS.txt.x, payerS.txt.y, 18, 0xd4a24a, 0.35);
    payerHalo.setStrokeStyle(1.5, 0xd4a24a, 0.9);
    this.tweens.add({ targets: payerHalo, radius: 28, alpha: 0, duration: 900, ease: "cubic.out", onComplete: () => payerHalo.destroy() });

    // Payer delta — red minus with asset unit
    if (amount > 0) {
      const payerDelta = this.add.text(payerS.txt.x - 16, payerS.txt.y - 14, `−${formatted}`, {
        fontFamily: FONT, fontSize: "11px", color: COLORS.red, fontStyle: "bold",
      }).setResolution(2).setOrigin(0.5, 0.5);
      this.tweens.add({ targets: payerDelta, y: payerDelta.y - 22, alpha: 0, duration: 1400, ease: "cubic.out", onComplete: () => payerDelta.destroy() });
    }

    // Payee halo — TINTED BY ASSET (was always mint)
    if (payeeS && payeeS !== payerS) {
      const payeeHalo = this.add.circle(payeeS.txt.x, payeeS.txt.y, 18, assetHexInt, 0.35);
      payeeHalo.setStrokeStyle(1.5, assetHexInt, 0.9);
      this.tweens.add({ targets: payeeHalo, radius: 28, alpha: 0, duration: 900, ease: "cubic.out", onComplete: () => payeeHalo.destroy() });

      if (amount > 0) {
        // Payee delta color = asset hex (not hardcoded mint)
        const payeeDelta = this.add.text(payeeS.txt.x + 16, payeeS.txt.y - 14, `+${formatted}`, {
          fontFamily: FONT, fontSize: "11px", color: assetHex, fontStyle: "bold",
        }).setResolution(2).setOrigin(0.5, 0.5);
        this.tweens.add({ targets: payeeDelta, y: payeeDelta.y - 22, alpha: 0, duration: 1400, ease: "cubic.out", onComplete: () => payeeDelta.destroy() });
      }
    }
  }
```

Add imports at top of `scene.ts`:

```typescript
import { formatAmount, hexFor } from "./asset-palette";
```

- [ ] **Step 10.3: Lint + commit**

```bash
pnpm --filter @nac/web lint 2>&1 | tail -3
git add apps/web/src/glyph/asset-palette.ts apps/web/src/glyph/scene.ts
git commit -m "feat(assets): asset-tinted halos + deltas on commit (🍓 pink, 💻 teal, € cobalt)"
```

---

### Task 11: `run-city.ts` wires per-asset fetcher

**Files:**
- Modify: `packages/orchestrator/cli/run-city.ts`

- [ ] **Step 11.1: Pass `getBalancesByAccount` to `startHttp`**

Read `run-city.ts`. Find the `startHttp({ ... })` options. Add:

```typescript
    getBalancesByAccount: (addr) => ledger.getBalancesByAccount(addr),
```

Alongside the existing `getBalance` line.

- [ ] **Step 11.2: Build + restart**

```bash
cd /Users/finnmabie/Documents/numscript-agent-city
pnpm --filter @nac/orchestrator build 2>&1 | tail -3
lsof -iTCP:3070 -sTCP:LISTEN -t 2>/dev/null | xargs -r kill 2>/dev/null
sleep 2
pnpm city:start > /tmp/city.log 2>&1 &
sleep 5
sqlite3 data/orchestrator.sqlite "UPDATE agents SET next_tick_at = 0;"
curl -s http://127.0.0.1:3071/snapshot | python3 -c "
import json, sys
d = json.load(sys.stdin)
for a in d.get('agents', [])[:3]:
    print(f\"{a['id']} {a['name']}: USD={a.get('balance')} all={list((a.get('balancesByAsset') or {}).keys())}\")
"
```

Expected: each agent shows `USD/2` plus whatever other assets they were seeded with (EUR, STRAWBERRY, COMPUTEHOUR).

- [ ] **Step 11.3: Commit**

```bash
git add packages/orchestrator/cli/run-city.ts
git commit -m "feat(assets): run-city passes getBalancesByAccount into /snapshot + /agent"
```

---

### Task 12: AgentPanel — per-asset balance table + Phase 8 smoke

**Files:**
- Modify: `apps/web/src/components/AgentPanel.tsx`

- [ ] **Step 12.1: Extend the AgentDetail + snapshot types**

Read `apps/web/src/components/AgentPanel.tsx`. Currently `AgentDetail.balance: number`. Extend:

```typescript
interface AgentDetail {
  agent: { id: string; name: string; role: string; tagline: string; color: string; hustleMode: 0 | 1 };
  balance: number;
  balancesByAsset?: Record<string, number>;
  metadata: Record<string, string>;
  transactions: LedgerTx[];
  intentLog: Array<...>;  // unchanged
}
```

In the header block, replace the single balance line with a compact multi-asset table:

```tsx
// After the existing header div (role + USD line), replace the single-line render
// with a small balances section:
{detail?.balancesByAsset && Object.keys(detail.balancesByAsset).length > 0 ? (
  <div className="mt-2 text-[11px] tabular-nums">
    {Object.entries(detail.balancesByAsset).map(([code, amt]) => (
      <div key={code} className="flex justify-between border-b border-mute/30 py-0.5">
        <span className="text-dim">{code}</span>
        <span className="text-paper">{formatAmountClient(code, amt)}</span>
      </div>
    ))}
  </div>
) : (
  <div className="text-dim text-[11px]">{a.role} · <span className="text-paper tabular-nums">${(balance / 100).toFixed(2)}</span></div>
)}
```

Helper at module scope:

```typescript
const ASSET_UNITS: Record<string, { decimals: number; unit: string; prefix: boolean }> = {
  "USD/2":          { decimals: 2, unit: "$",  prefix: true  },
  "EUR/2":          { decimals: 2, unit: "€",  prefix: true  },
  "STRAWBERRY/0":   { decimals: 0, unit: "🍓", prefix: false },
  "COMPUTEHOUR/0": { decimals: 0, unit: "💻", prefix: false }
};
function formatAmountClient(code: string, amt: number): string {
  const m = ASSET_UNITS[code];
  if (!m) return `${amt} ${code}`;
  const v = m.decimals === 0 ? String(amt) : (amt / 100).toFixed(m.decimals);
  return m.prefix ? `${m.unit}${v}` : `${v} ${m.unit}`;
}
```

- [ ] **Step 12.2: Lint + restart + smoke**

```bash
pnpm --filter @nac/web lint 2>&1 | tail -3
```

Must exit 0.

Then in the browser (http://localhost:3000/):
1. Canvas renders with no console errors
2. Open an AgentPanel — you see multi-asset balances table
3. Within ~2 minutes, watch for a `commodity_swap` commit — it should paint a pink (🍓) or teal (💻) halo on the receiver instead of the default mint

- [ ] **Step 12.3: Commit + push**

```bash
git add apps/web/src/components/AgentPanel.tsx
git commit -m "feat(assets): AgentPanel per-asset balance table"
git push origin arena 2>&1 | tail -3
```

**Phase 8 release gate:** After Task 12 the city transacts in 4 assets, agents see their full asset holdings in context, commits visually distinguish by asset, and the AgentPanel shows the per-asset breakdown. Phase 9 (price discovery) is additive — build on top when you're ready.

---

## Phase 9 — Price discovery

Adds a visitor-driven price signal + backend VWAP engine + HUD modal + sparkline.

---

### Task 13: `price_signals` storage + repo

**Files:**
- Create: `packages/orchestrator/migrations/006_price_signals.sql`
- Create: `packages/orchestrator/src/price-signals.ts` — id generator + text validator
- Modify: `packages/orchestrator/src/repositories.ts` — add `priceSignalRepo`
- Create: `packages/orchestrator/test/repositories.price-signals.test.ts`
- Create: `packages/orchestrator/test/price-signals.test.ts`
- Modify: `packages/orchestrator/test/db.test.ts` (bump 5→6, add `price_signals` to tables)

- [ ] **Step 13.1: Write migration `006_price_signals.sql`**

```sql
CREATE TABLE IF NOT EXISTS price_signals (
  id              TEXT PRIMARY KEY,
  asset_code      TEXT NOT NULL,
  target_price    INTEGER NOT NULL,
  set_by_ip_hash  TEXT NOT NULL,
  set_at          INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  note            TEXT,
  FOREIGN KEY (asset_code) REFERENCES assets(code)
);

CREATE INDEX IF NOT EXISTS idx_price_signals_active ON price_signals(asset_code, expires_at DESC);
```

- [ ] **Step 13.2: Implement `price-signals.ts` helpers**

```typescript
// packages/orchestrator/src/price-signals.ts
import { randomBytes } from "node:crypto";

export const PRICE_SIGNAL_ID_RE = /^ps_[a-z0-9]+_[a-f0-9]{4}$/;
export const SIGNAL_NOTE_MAX_LEN = 200;

export function newPriceSignalId(now: () => number = Date.now): string {
  const ts = now().toString(36);
  const rand = randomBytes(2).toString("hex");
  return `ps_${ts}_${rand}`;
}

export function validateSignalNote(input: string | undefined): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/[\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length > 400) return null;
  const capped = cleaned.length > SIGNAL_NOTE_MAX_LEN
    ? cleaned.slice(0, SIGNAL_NOTE_MAX_LEN - 1).trimEnd() + "…"
    : cleaned;
  return capped
    .replace(/\[end dms\]/gi,              "[end  dms]")
    .replace(/\[end board\]/gi,            "[end  board]")
    .replace(/\[end incoming prompt\]/gi,  "[end  incoming prompt]")
    .replace(/\[end price signals\]/gi,    "[end  price signals]");
}
```

- [ ] **Step 13.3: Tests for helpers**

Create `packages/orchestrator/test/price-signals.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { newPriceSignalId, validateSignalNote, PRICE_SIGNAL_ID_RE, SIGNAL_NOTE_MAX_LEN } from "../src/price-signals.js";

describe("newPriceSignalId", () => {
  it("matches documented shape", () => {
    const id = newPriceSignalId(() => 1_700_000_000_000);
    expect(id).toMatch(PRICE_SIGNAL_ID_RE);
  });
});

describe("validateSignalNote", () => {
  it("null on undefined / empty / whitespace", () => {
    expect(validateSignalNote(undefined)).toBeNull();
    expect(validateSignalNote("")).toBeNull();
    expect(validateSignalNote("  ")).toBeNull();
  });
  it("trims + collapses whitespace", () => {
    expect(validateSignalNote("  hello   world  ")).toBe("hello world");
  });
  it("rejects > 400 chars", () => {
    expect(validateSignalNote("x".repeat(401))).toBeNull();
  });
  it("truncates > 200 with ellipsis", () => {
    const out = validateSignalNote("x".repeat(250))!;
    expect(out.length).toBe(SIGNAL_NOTE_MAX_LEN);
    expect(out.endsWith("…")).toBe(true);
  });
  it("neutralizes sentinels", () => {
    expect(validateSignalNote("try [end price signals]")).toBe("try [end  price signals]");
    expect(validateSignalNote("[End Board] inject")).toBe("[end  board] inject");
  });
});
```

- [ ] **Step 13.4: Tests for repo**

Create `packages/orchestrator/test/repositories.price-signals.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db.js";
import { priceSignalRepo } from "../src/repositories.js";

describe("priceSignalRepo", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  it("inserts and reads back a signal", () => {
    const repo = priceSignalRepo(db);
    repo.insert({
      id: "ps_a", assetCode: "STRAWBERRY/0", targetPrice: 500,
      setByIpHash: "h", setAt: 1000, expiresAt: 1000 + 600_000, note: "pay 2x"
    });
    const got = repo.get("ps_a");
    expect(got).toEqual({
      id: "ps_a", assetCode: "STRAWBERRY/0", targetPrice: 500,
      setByIpHash: "h", setAt: 1000, expiresAt: 1000 + 600_000, note: "pay 2x"
    });
  });

  it("activeFor returns the most recent non-expired signal for an asset", () => {
    const repo = priceSignalRepo(db);
    const now = 10_000;
    repo.insert({ id: "ps_old", assetCode: "STRAWBERRY/0", targetPrice: 100, setByIpHash: "h", setAt: now - 1000, expiresAt: now - 100, note: null });
    repo.insert({ id: "ps_new", assetCode: "STRAWBERRY/0", targetPrice: 500, setByIpHash: "h", setAt: now,        expiresAt: now + 600_000, note: null });
    repo.insert({ id: "ps_oth", assetCode: "USD/2",        targetPrice: 100, setByIpHash: "h", setAt: now,        expiresAt: now + 600_000, note: null });
    const active = repo.activeFor("STRAWBERRY/0", now);
    expect(active?.id).toBe("ps_new");
  });

  it("activeFor returns null if no active signal", () => {
    const repo = priceSignalRepo(db);
    expect(repo.activeFor("STRAWBERRY/0", Date.now())).toBeNull();
  });

  it("recentByIp counts signals in a window", () => {
    const repo = priceSignalRepo(db);
    const now = 10_000;
    repo.insert({ id: "a", assetCode: "USD/2", targetPrice: 1, setByIpHash: "x", setAt: now - 30_000, expiresAt: now + 600_000, note: null });
    repo.insert({ id: "b", assetCode: "USD/2", targetPrice: 1, setByIpHash: "x", setAt: now - 10_000, expiresAt: now + 600_000, note: null });
    repo.insert({ id: "c", assetCode: "USD/2", targetPrice: 1, setByIpHash: "y", setAt: now - 10_000, expiresAt: now + 600_000, note: null });
    expect(repo.recentByIp("x", now - 60_000)).toBe(2);
    expect(repo.recentByIp("y", now - 60_000)).toBe(1);
  });
});
```

- [ ] **Step 13.5: Implement `priceSignalRepo`**

Append to `packages/orchestrator/src/repositories.ts`:

```typescript
// ── Price Signals ────────────────────────────────────────────────────────
export interface PriceSignalRecord {
  id: string;
  assetCode: string;
  targetPrice: number;
  setByIpHash: string;
  setAt: number;
  expiresAt: number;
  note: string | null;
}

export function priceSignalRepo(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO price_signals (id, asset_code, target_price, set_by_ip_hash, set_at, expires_at, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const get = db.prepare(`SELECT * FROM price_signals WHERE id = ?`);
  const active = db.prepare(`
    SELECT * FROM price_signals
    WHERE asset_code = ? AND expires_at > ?
    ORDER BY set_at DESC LIMIT 1
  `);
  const recentByIpStmt = db.prepare(`
    SELECT COUNT(*) AS c FROM price_signals
    WHERE set_by_ip_hash = ? AND set_at >= ?
  `);

  const row2rec = (r: any): PriceSignalRecord => ({
    id: r.id,
    assetCode: r.asset_code,
    targetPrice: r.target_price,
    setByIpHash: r.set_by_ip_hash,
    setAt: r.set_at,
    expiresAt: r.expires_at,
    note: r.note
  });

  return {
    insert(args: {
      id: string; assetCode: string; targetPrice: number;
      setByIpHash: string; setAt: number; expiresAt: number; note: string | null;
    }): void {
      insert.run(args.id, args.assetCode, args.targetPrice, args.setByIpHash, args.setAt, args.expiresAt, args.note);
    },
    get(id: string): PriceSignalRecord | null {
      const r = get.get(id);
      return r ? row2rec(r) : null;
    },
    activeFor(assetCode: string, now: number): PriceSignalRecord | null {
      const r = active.get(assetCode, now);
      return r ? row2rec(r) : null;
    },
    recentByIp(ipHash: string, since: number): number {
      const r = recentByIpStmt.get(ipHash, since) as { c: number };
      return r?.c ?? 0;
    }
  };
}
```

- [ ] **Step 13.6: Update db.test.ts + run + commit**

Bump migration count 5→6; add `"price_signals"` to expected tables. Then:

```bash
pnpm --filter @nac/orchestrator test -- --run price-signals db
git add packages/orchestrator/migrations/006_price_signals.sql \
        packages/orchestrator/src/price-signals.ts \
        packages/orchestrator/src/repositories.ts \
        packages/orchestrator/test/price-signals.test.ts \
        packages/orchestrator/test/repositories.price-signals.test.ts \
        packages/orchestrator/test/db.test.ts
git commit -m "feat(market): price_signals storage + repo"
```

---

### Task 14: VWAP computation helper

**Files:**
- Create: `packages/orchestrator/src/vwap.ts`
- Create: `packages/orchestrator/test/vwap.test.ts`

- [ ] **Step 14.1: Write failing tests**

Create `packages/orchestrator/test/vwap.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeVwap, type SwapSample } from "../src/vwap.js";

describe("computeVwap", () => {
  it("returns null for empty samples", () => {
    expect(computeVwap([])).toBeNull();
  });

  it("returns the single-sample price", () => {
    const samples: SwapSample[] = [
      { quoteAmount: 500, baseAmount: 5, timestamp: 1000 }
    ];
    expect(computeVwap(samples)).toBe(100);  // $1.00 per unit
  });

  it("volume-weights across multiple samples", () => {
    const samples: SwapSample[] = [
      { quoteAmount: 500,  baseAmount: 5,  timestamp: 1000 }, // $1.00/unit, 5 units
      { quoteAmount: 3000, baseAmount: 10, timestamp: 2000 }  // $3.00/unit, 10 units
    ];
    // VWAP = (500+3000) / (5+10) = 3500 / 15 = 233.33
    expect(computeVwap(samples)).toBeCloseTo(233.33, 1);
  });

  it("skips samples with zero base amount (avoid div by zero)", () => {
    const samples: SwapSample[] = [
      { quoteAmount: 100, baseAmount: 0, timestamp: 1000 },
      { quoteAmount: 500, baseAmount: 5, timestamp: 2000 }
    ];
    expect(computeVwap(samples)).toBe(100);
  });
});
```

- [ ] **Step 14.2: Implement**

Create `packages/orchestrator/src/vwap.ts`:

```typescript
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
```

- [ ] **Step 14.3: Run + commit**

```bash
pnpm --filter @nac/orchestrator test -- --run vwap
git add packages/orchestrator/src/vwap.ts packages/orchestrator/test/vwap.test.ts
git commit -m "feat(market): VWAP computation + swap sample extractor"
```

---

### Task 15: HTTP — POST /market/:asset/signal + GET /market/:asset

**Files:**
- Modify: `packages/orchestrator/src/http.ts`
- Create: `packages/orchestrator/test/market-http.test.ts`

- [ ] **Step 15.1: Write failing tests**

Create `packages/orchestrator/test/market-http.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, agentRepo } from "../src/index.js";
import { startHttp } from "../src/http.js";
import { priceSignalRepo } from "../src/repositories.js";

async function post(port: number, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

describe("market HTTP", () => {
  let db: Database.Database;
  let handle: Awaited<ReturnType<typeof startHttp>>;

  beforeEach(async () => {
    db = new Database(":memory:");
    runMigrations(db);
    handle = await startHttp({
      port: 0, db,
      getBalance: async () => 0,
      ledgerGet: async () => ({ ok: true, status: 200, body: { cursor: { data: [] } } }),
      priceSignalRepo: priceSignalRepo(db),
      priceSignalSalt: "test-salt",
      priceSignalRateLimit: { max: 2, windowMs: 5 * 60_000 }
    });
  });
  afterEach(async () => { handle.server.close(); db.close(); });

  it("POST accepts a valid signal", async () => {
    const res = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
      { targetPrice: 500, durationMs: 600_000, note: "pay 2x" },
      { "x-forwarded-for": "1.1.1.1" });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.signalId).toMatch(/^ps_/);
    expect(body.assetCode).toBe("STRAWBERRY/0");
  });

  it("POST rejects unknown asset with 404", async () => {
    const res = await post(handle.port, "/market/MYSTERY%2F0/signal",
      { targetPrice: 500 });
    expect(res.status).toBe(404);
  });

  it("POST rejects missing targetPrice with 400", async () => {
    const res = await post(handle.port, "/market/STRAWBERRY%2F0/signal", {});
    expect(res.status).toBe(400);
  });

  it("POST rate-limits per IP", async () => {
    for (let i = 0; i < 2; i++) {
      const r = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
        { targetPrice: 500 },
        { "x-forwarded-for": "9.9.9.9" });
      expect(r.status).toBe(202);
    }
    const blocked = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
      { targetPrice: 500 },
      { "x-forwarded-for": "9.9.9.9" });
    expect(blocked.status).toBe(429);
  });

  it("GET /market/:asset returns active signal + vwap stub", async () => {
    const set = await post(handle.port, "/market/STRAWBERRY%2F0/signal",
      { targetPrice: 500, durationMs: 600_000 });
    expect(set.status).toBe(202);
    const res = await fetch(`http://127.0.0.1:${handle.port}/market/STRAWBERRY%2F0`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assetCode).toBe("STRAWBERRY/0");
    expect(body.signal?.targetPrice).toBe(500);
    // vwap is null here because ledgerGet returns empty cursor
    expect(body.vwap).toBeNull();
  });
});
```

- [ ] **Step 15.2: Implement handlers in `http.ts`**

Read `http.ts`. Extend `StartHttpOptions`:

```typescript
import type { priceSignalRepo as priceSignalRepoFactory } from "./repositories.js";

// ...

  priceSignalRepo?: ReturnType<typeof priceSignalRepoFactory>;
  priceSignalSalt?: string;
  priceSignalRateLimit?: { max: number; windowMs: number };
```

Add imports:

```typescript
import { newPriceSignalId, validateSignalNote } from "./price-signals.js";
import { computeVwap, extractSwapSamples } from "./vwap.js";
import { ASSET_REGISTRY } from "./assets.js";
```

Inside the request handler, initialize a market rate-limiter once (alongside the existing `arenaLimiter`):

```typescript
  const marketLimiter: RateLimiter | null = opts.priceSignalRateLimit
    ? createRateLimiter(opts.priceSignalRateLimit)
    : null;
```

Before the final `json(res, 404, { error: "not found" })`, add:

```typescript
    // ── POST /market/:asset/signal ──────────────────────────────────────
    const signalPostMatch = req.method === "POST" && req.url
      ? new URL(req.url, "http://127.0.0.1").pathname.match(/^\/market\/([^/]+)\/signal$/)
      : null;
    if (signalPostMatch) {
      if (!opts.priceSignalRepo || !opts.priceSignalSalt) {
        return json(res, 503, { error: "market not configured" });
      }
      const assetCode = decodeURIComponent(signalPostMatch[1]);
      const asset = ASSET_REGISTRY.find((a) => a.code === assetCode);
      if (!asset) return json(res, 404, { error: `unknown asset ${assetCode}` });

      let body: any;
      try { body = await readJson(req); }
      catch (e) {
        const err = e as Error & { code?: string };
        if (err.code === "BODY_TOO_LARGE") return json(res, 413, { error: "body too large" });
        return json(res, 400, { error: "invalid JSON" });
      }
      const targetPrice = Number(body?.targetPrice);
      if (!Number.isFinite(targetPrice) || targetPrice < 1 || !Number.isInteger(targetPrice)) {
        return json(res, 400, { error: "targetPrice required (positive integer minor units)" });
      }
      const durationMs = Math.min(60 * 60_000, Math.max(60_000, Number(body?.durationMs ?? 10 * 60_000)));
      const note = validateSignalNote(body?.note);

      const ip = clientIp(req);
      const ipH = hashIp(ip, opts.priceSignalSalt);
      if (marketLimiter) {
        const r = marketLimiter.check(ipH);
        if (!r.allowed) {
          res.writeHead(429, {
            "content-type": "application/json",
            "retry-after": String(Math.ceil(r.retryAfterMs / 1000)),
            ...CORS
          });
          return res.end(JSON.stringify({ error: "rate limited", retryAfterMs: r.retryAfterMs }));
        }
      }

      const signalId = newPriceSignalId();
      const setAt = Date.now();
      const expiresAt = setAt + durationMs;
      opts.priceSignalRepo.insert({
        id: signalId, assetCode, targetPrice,
        setByIpHash: ipH, setAt, expiresAt, note
      });
      opts.onPriceSignalSet?.({ signalId, assetCode, targetPrice, expiresAt });
      return json(res, 202, { signalId, assetCode, targetPrice, setAt, expiresAt, note });
    }

    // ── GET /market/:asset ───────────────────────────────────────────────
    const marketGetMatch = req.method === "GET" && req.url
      ? new URL(req.url, "http://127.0.0.1").pathname.match(/^\/market\/([^/]+)$/)
      : null;
    if (marketGetMatch) {
      const assetCode = decodeURIComponent(marketGetMatch[1]);
      const asset = ASSET_REGISTRY.find((a) => a.code === assetCode);
      if (!asset) return json(res, 404, { error: `unknown asset ${assetCode}` });
      const signal = opts.priceSignalRepo?.activeFor(assetCode, Date.now()) ?? null;

      // Compute VWAP from the last 100 txs touching this asset within the
      // last 10 min. Falls back to null if none.
      let vwap: number | null = null;
      let samples = 0;
      try {
        const txsRes = await opts.ledgerGet(
          `/transactions?metadata[asset]=${encodeURIComponent(assetCode)}&pageSize=100`
        );
        const txsData = extractCursorData(txsRes.body);
        const rawTxs = Array.isArray(txsData) ? txsData : [];
        const allSamples = extractSwapSamples(rawTxs, assetCode);
        const cutoff = Date.now() - 10 * 60_000;
        const recent = allSamples.filter((s) => s.timestamp >= cutoff);
        vwap = computeVwap(recent);
        samples = recent.length;
      } catch {
        // non-fatal — vwap stays null
      }

      return json(res, 200, { assetCode, signal, vwap, samples });
    }
```

Also add an optional hook field to `StartHttpOptions`:

```typescript
  /** Invoked after a signal is inserted — run-city uses this to fan out a WS event. */
  onPriceSignalSet?: (args: { signalId: string; assetCode: string; targetPrice: number; expiresAt: number }) => void;
```

- [ ] **Step 15.3: Run + commit**

```bash
pnpm --filter @nac/orchestrator test -- --run market-http
git add packages/orchestrator/src/http.ts packages/orchestrator/test/market-http.test.ts
git commit -m "feat(market): POST /market/:asset/signal + GET /market/:asset (VWAP)"
```

---

### Task 16: Event kinds + run-city wiring + VWAP ticker

**Files:**
- Modify: `packages/orchestrator/src/types.ts` — add `"price-signal-set"` + `"price-vwap-update"` to `CityEventKind`
- Modify: `apps/web/src/lib/event-schema.ts` — mirror new variants
- Modify: `packages/orchestrator/cli/watch-events.ts` — add cases for exhaustiveness
- Modify: `packages/orchestrator/cli/run-city.ts` — instantiate `priceSignalRepo`, pass to http, start 30s VWAP ticker
- Modify: `packages/orchestrator/src/context-builder.ts` — add "Market prices" block

- [ ] **Step 16.1: Extend event types**

In `types.ts`:

```typescript
  | "price-signal-set"
  | "price-vwap-update";
```

In `event-schema.ts`, append:

```typescript
  | (Base & { kind: "price-signal-set"; data: { signalId: string; assetCode: string; targetPrice: number; expiresAt: number } })
  | (Base & { kind: "price-vwap-update"; data: { assetCode: string; vwap: number | null; samples: number; asOf: number } });
```

In `watch-events.ts`, add case arms before the `default`:

```typescript
    case "price-signal-set":
      return `${head} ${dim("price!")} ${(e.data as any).assetCode} → ${(e.data as any).targetPrice}`;
    case "price-vwap-update":
      return `${head} ${dim("vwap")} ${(e.data as any).assetCode} ${(e.data as any).vwap ?? "—"}`;
```

- [ ] **Step 16.2: Wire in `run-city.ts`**

Add imports:

```typescript
import { priceSignalRepo } from "./src/repositories.js";
import { computeVwap, extractSwapSamples } from "./src/vwap.js";
import { ASSET_REGISTRY } from "./src/assets.js";
```

After the existing `const dms = dmRepo(db);` line, add:

```typescript
  const priceSignals = priceSignalRepo(db);
  const priceSignalSalt = process.env.PRICE_SIGNAL_SALT && process.env.PRICE_SIGNAL_SALT.length >= 16
    ? process.env.PRICE_SIGNAL_SALT
    : randomBytes(24).toString("hex");
```

Extend `startHttp` opts:

```typescript
    priceSignalRepo: priceSignals,
    priceSignalSalt,
    priceSignalRateLimit: { max: 2, windowMs: 5 * 60_000 },
    onPriceSignalSet: (args) => {
      bus.emit({
        kind: "price-signal-set",
        agentId: "-",
        tickId: `signal:${args.signalId}`,
        at: Date.now(),
        data: args
      });
    },
```

Then at the bottom of `main`, before the `await new Promise(() => {});` wait, start the VWAP ticker:

```typescript
  // Background VWAP ticker — every 30s, compute VWAP per asset from the
  // last 10 min of ledger txs and broadcast via WS. Keeps sparklines
  // moving even when trading is quiet.
  const vwapTimer = setInterval(async () => {
    for (const asset of ASSET_REGISTRY) {
      try {
        const txsRes = await ledger.get(
          `/transactions?metadata[asset]=${encodeURIComponent(asset.code)}&pageSize=100`
        );
        const body = txsRes.body as any;
        const rawTxs = Array.isArray(body?.cursor?.data) ? body.cursor.data : [];
        const samples = extractSwapSamples(rawTxs, asset.code).filter(
          (s) => s.timestamp >= Date.now() - 10 * 60_000
        );
        const vwap = computeVwap(samples);
        bus.emit({
          kind: "price-vwap-update",
          agentId: "-",
          tickId: `vwap:${asset.code}:${Date.now()}`,
          at: Date.now(),
          data: { assetCode: asset.code, vwap, samples: samples.length, asOf: Date.now() }
        });
      } catch {
        // non-fatal
      }
    }
  }, 30_000);

  // Existing shutdown handler should clear this timer too
```

Update the SIGINT/SIGTERM shutdown handler to call `clearInterval(vwapTimer)` before process.exit.

- [ ] **Step 16.3: Extend context-builder with market prices**

Read `context-builder.ts`. Add to `ContextInput`:

```typescript
  /** Active market info per asset — rendered as a "Market prices" block when present. */
  market?: Array<{ assetCode: string; vwap: number | null; target: number | null; targetExpiresAt: number | null }>;
```

Before the final `user` assembly, build a `marketBlock`:

```typescript
  const market = input.market ?? [];
  const marketBlock = market.length === 0 ? "" : (() => {
    const lines = market.map((m) => {
      const vwapStr = m.vwap === null ? "—" : `${m.vwap.toFixed(2)}`;
      const targetStr = m.target === null ? "" : `  (visitor target: ${m.target})`;
      return `  ${m.assetCode.padEnd(16)} VWAP ${vwapStr}${targetStr}`;
    });
    return [
      ``,
      `[market prices — trailing 10-min VWAP; visitor target when set]`,
      ...lines,
      `[end market]`,
      `If market price differs from visitor target, there's an arbitrage opportunity. The visitor cannot force you to trade — use this info to decide.`,
      ``
    ].join("\n");
  })();
```

Insert `marketBlock` into the user-string assembly between `dmsBlock` and `injectionBlock`.

Update `tick.ts` to fetch market data + pass it:

```typescript
    const market = await Promise.all(ASSET_REGISTRY.map(async (a) => {
      const signal = deps.priceSignalRepo?.activeFor(a.code, Date.now()) ?? null;
      return {
        assetCode: a.code,
        vwap: null,  // VWAP fetch is expensive — leave null in tick, broadcast via WS ticker instead
        target: signal?.targetPrice ?? null,
        targetExpiresAt: signal?.expiresAt ?? null
      };
    }));
```

Extend `TickDeps` to include `priceSignalRepo?: PriceSignalRepoT` and pass from `run-city.ts`.

(Simplification note: we don't compute live VWAP inside every tick — that would be N agents × N assets fetches, too chatty. Only the background ticker broadcasts VWAP. Agents see TARGET in context; they see VWAP only via the frontend → which also means the agent-side arbitrage is based mostly on target visibility. Good enough for v1.)

- [ ] **Step 16.4: Build + commit**

```bash
pnpm --filter @nac/orchestrator build
pnpm --filter @nac/web lint
git add -A
git commit -m "feat(market): event kinds + run-city wiring + VWAP ticker + market context block"
```

---

### Task 17: Frontend — price store + PriceSignalModal + PriceTicker

**Files:**
- Modify: `apps/web/src/state/city-store.ts` — `prices` + `signals` slices
- Modify: `apps/web/src/glyph/store-adapter.ts` — new event forwarding
- Create: `apps/web/src/components/PriceSignalModal.tsx`
- Create: `apps/web/src/glyph/hud/PriceTicker.tsx`
- Modify: `apps/web/src/glyph/GlyphStage.tsx` — mount modal + ticker
- Modify: `apps/web/src/components/HudTopBar.tsx` — "🎯 Set a price" button

- [ ] **Step 17.1: Store slice**

In `city-store.ts` add:

```typescript
export interface MarketSnapshot {
  assetCode: string;
  vwap: number | null;
  vwapHistory: number[];   // last ~30 samples for sparkline
  target: number | null;
  targetExpiresAt: number | null;
  updatedAt: number;
}

interface CityState {
  // ... existing ...
  market: Record<string, MarketSnapshot>;
}

// initial state:
  market: {},
```

Extend `applyEvent`:

```typescript
      if (e.kind === "price-signal-set") {
        const d = (e as any).data;
        const existing = s.market[d.assetCode] ?? { assetCode: d.assetCode, vwap: null, vwapHistory: [], target: null, targetExpiresAt: null, updatedAt: 0 };
        next.market = {
          ...s.market,
          [d.assetCode]: { ...existing, target: d.targetPrice, targetExpiresAt: d.expiresAt, updatedAt: e.at }
        };
      }
      if (e.kind === "price-vwap-update") {
        const d = (e as any).data;
        const existing = s.market[d.assetCode] ?? { assetCode: d.assetCode, vwap: null, vwapHistory: [], target: null, targetExpiresAt: null, updatedAt: 0 };
        const history = d.vwap !== null
          ? [...existing.vwapHistory, d.vwap].slice(-30)
          : existing.vwapHistory;
        next.market = {
          ...s.market,
          [d.assetCode]: { ...existing, vwap: d.vwap, vwapHistory: history, updatedAt: d.asOf }
        };
      }
```

- [ ] **Step 17.2: PriceSignalModal**

Create `apps/web/src/components/PriceSignalModal.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";

const ORCH_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";

const ASSETS = [
  { code: "STRAWBERRY/0", label: "🍓 Strawberry", decimals: 0, prefix: "" },
  { code: "COMPUTEHOUR/0", label: "💻 Compute hour", decimals: 0, prefix: "" },
  { code: "EUR/2", label: "€ Euro", decimals: 2, prefix: "$" },
  { code: "USD/2", label: "$ US Dollar", decimals: 2, prefix: "$" }
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
    const minor = Math.round(priceNum * (assetMeta.decimals === 2 ? 100 : 1));
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
      <div onClick={(e) => e.stopPropagation()} className="bg-ink border border-mute p-5 w-[320px] font-mono text-[12px]">
        <div className="text-[10px] uppercase tracking-wider text-dim mb-2">🎯 Set a target price</div>
        <label className="text-[10px] text-dim block mt-2">Asset</label>
        <select value={asset} onChange={(e) => setAsset(e.target.value)} className="w-full bg-ink border border-mute text-paper p-1">
          {ASSETS.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
        </select>
        <label className="text-[10px] text-dim block mt-3">Target price (per unit, {assetMeta.decimals === 2 ? "USD" : "USD per 1 unit"})</label>
        <input type="number" min="0" step={assetMeta.decimals === 2 ? "0.01" : "1"} value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-ink border border-mute text-paper p-1" placeholder="5.00" />
        <label className="text-[10px] text-dim block mt-3">Note (optional, ≤200 chars)</label>
        <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-ink border border-mute text-paper p-1" placeholder="e.g. strawberry shortage" />
        {err && <div className="text-scream text-[11px] mt-2">{err}</div>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setOpen(false)} className="text-[10px] uppercase tracking-wider text-dim px-2 py-1">cancel</button>
          <button onClick={submit} disabled={status === "sending"} className="text-[10px] uppercase tracking-wider bg-paper text-ink px-2 py-1 disabled:opacity-50">
            {status === "sending" ? "setting…" : "set"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 17.3: PriceTicker bottom-rail component**

Create `apps/web/src/glyph/hud/PriceTicker.tsx`:

```tsx
"use client";
import { useCityStore } from "../../state/city-store";

const ASSET_META: Record<string, { emoji: string; decimals: number; prefix: string }> = {
  "STRAWBERRY/0":   { emoji: "🍓", decimals: 0, prefix: "" },
  "COMPUTEHOUR/0": { emoji: "💻", decimals: 0, prefix: "" },
  "EUR/2":          { emoji: "€",  decimals: 2, prefix: "$" },
  "USD/2":          { emoji: "$",  decimals: 2, prefix: "$" }
};

function fmt(code: string, v: number | null): string {
  if (v === null) return "—";
  const m = ASSET_META[code]; if (!m) return v.toFixed(2);
  return m.decimals === 2 ? `$${(v / 100).toFixed(2)}` : `$${(v / 100).toFixed(2)}`;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <svg width="60" height="14" />;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const d = points.map((v, i) => {
    const x = (i / (points.length - 1)) * 58 + 1;
    const y = 13 - ((v - min) / range) * 12;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="60" height="14" className="inline-block align-middle">
      <path d={d} stroke="#BAEABC" strokeWidth="1" fill="none" />
    </svg>
  );
}

export default function PriceTicker() {
  const market = useCityStore((s) => s.market);
  const items = Object.values(market).filter((m) => ASSET_META[m.assetCode]);
  if (items.length === 0) {
    return <div className="text-[10px] text-dim italic">market: collecting…</div>;
  }
  return (
    <div className="flex gap-4 items-center text-[10px] tabular-nums">
      {items.map((m) => {
        const meta = ASSET_META[m.assetCode];
        const hasTarget = m.target !== null && (m.targetExpiresAt ?? 0) > Date.now();
        return (
          <span key={m.assetCode} className="flex items-center gap-1">
            <span>{meta.emoji}</span>
            <span className="text-paper">{fmt(m.assetCode, m.vwap)}</span>
            <Sparkline points={m.vwapHistory} />
            {hasTarget && <span className="text-gold">🎯 {fmt(m.assetCode, m.target)}</span>}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 17.4: Mount modal + ticker**

In `GlyphStage.tsx` add imports + render inside `<div className="glyph-root shell">`:

```tsx
import PriceSignalModal from "../components/PriceSignalModal";
import PriceTicker from "./hud/PriceTicker";

// ... inside the root div after BottomRail:
<PriceSignalModal />
```

In `HudTopBar.tsx` add a button:

```tsx
<button
  onClick={() => window.dispatchEvent(new CustomEvent("nac:price-signal-open"))}
  className="text-[10px] uppercase tracking-wider border border-gold text-gold px-2 py-1 hover:bg-gold hover:text-ink transition-colors"
>
  🎯 Set a price
</button>
```

For the PriceTicker, best location is the existing `BottomRail` — add it as a child there (the BottomRail already has `flex gap-18`, drop in `<PriceTicker />` before the spacer).

- [ ] **Step 17.5: Lint + commit + push**

```bash
pnpm --filter @nac/web lint 2>&1 | tail -3
git add -A
git commit -m "feat(market): PriceSignalModal + PriceTicker sparkline + HUD button"
git push origin arena 2>&1 | tail -3
```

---

### Task 18: Restart + E2E smoke + push

- [ ] **Step 18.1: Rebuild + reseed**

```bash
cd /Users/finnmabie/Documents/numscript-agent-city
pnpm --filter @nac/orchestrator build
# rebalance + seed the new assets if not already
pnpm seed-genesis 2>&1 | tail -20
lsof -iTCP:3070 -sTCP:LISTEN -t 2>/dev/null | xargs -r kill 2>/dev/null
sleep 2
pnpm city:start > /tmp/city.log 2>&1 &
sleep 6
sqlite3 data/orchestrator.sqlite "UPDATE agents SET next_tick_at = 0;"
tail -6 /tmp/city.log
```

Expected log includes startup lines + no crashes.

- [ ] **Step 18.2: Verify endpoints**

```bash
curl -s -o /dev/null -w "snapshot=%{http_code}\n" http://127.0.0.1:3071/snapshot
curl -s -o /dev/null -w "market-strawberry=%{http_code}\n" http://127.0.0.1:3071/market/STRAWBERRY%2F0
curl -s -X POST http://127.0.0.1:3071/market/STRAWBERRY%2F0/signal \
  -H "content-type: application/json" \
  -d '{"targetPrice": 500, "durationMs": 600000}' | head -c 200
```

Expected:
- snapshot 200, market 200
- POST /market/STRAWBERRY/0/signal returns `{"signalId":"ps_...","assetCode":"STRAWBERRY/0","targetPrice":500,...}`

- [ ] **Step 18.3: Browser smoke**

Open `http://localhost:3000/`:
1. Top bar shows "🎯 Set a price" button
2. Click — modal opens, pick STRAWBERRY, set $5.00, note "artificial shortage", submit
3. Bottom ticker shows `🍓 — · 🎯 $5.00` (VWAP may be dashes until first trades happen)
4. Within 2 minutes, commits happen and VWAP starts populating — sparkline animates
5. Open AgentPanel on Grace — see per-asset balances including STRAWBERRY
6. Watch for a commodity_swap commit — see pink (🍓) halo on receiver

- [ ] **Step 18.4: Final commit + push**

```bash
git add -A
git commit --allow-empty -m "feat(market): Phase 9 release gate passed"
git push origin arena 2>&1 | tail -3
```

---

## Release gate

**Phase 8 done when:**
- All 4 assets seeded + circulating
- commodity_swap template committed at least once
- AgentPanel shows per-asset balances
- Coin-trail halo tinted by asset

**Phase 9 done when:**
- POST /market/:asset/signal returns 202 on valid input, 429 on rate limit
- GET /market/:asset returns both signal and VWAP
- Modal + ticker render in browser; visitor can set a target and see it in the ticker
- VWAP ticker updates every 30s via WS event
- Agents' system prompt includes target price info; LLM behavior tilts toward arbitrage

---

## Self-review notes

**Spec coverage (2026-04-22-multi-asset-and-price-discovery-design.md):**

- §5.1 Asset registry → Task 1
- §5.2 Price-signals table → Task 13
- §5.3 Market VWAP → Task 14 + 16 (background ticker)
- §6.1 commodity_swap template → Task 3
- §6.2 Asset-agnostic templates → already work (Task 1 just registers assets)
- §7.1 Tick context per-asset block → Task 6
- §7.2 Agent asset preferences → Task 4
- §7.3 Price-responsive behavior → implicit via Task 16 context block — agents see target, decide
- §8.1 Per-asset coin-trail colors → Task 10
- §8.2 Price ticker in bottom rail → Task 17
- §8.3 Price-signal setter modal → Task 17
- §8.4 Sparkline → Task 17
- §8.5 AgentPanel per-asset balance → Task 12
- §9 Events — `price-signal-set` + `price-vwap-update` → Task 16
- §10 Safety (rate limit, sentinel neutralize, hashed IP) → Task 13 (validator) + Task 15 (rate limit)

**Placeholder audit:** No "TBD", "TODO later". Every step has concrete code or exact commands.

**Type consistency:**
- `balancesByAsset: Record<string, Record<string, number>>` used uniformly Tasks 6, 7, 8, 9, 12
- `GlyphCommitEvent.asset?: string` threaded through Task 9 (emit) + Task 10 (render)
- `MarketSnapshot` shape identical in Tasks 16 (backend fanout), 17 (frontend store + ticker)
- `price-signal-set` / `price-vwap-update` payloads identical between backend emit (Task 16) and frontend apply (Task 17)
