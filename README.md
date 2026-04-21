# Numscript Agent City

An agent economy demo on Formance Ledger. Demonstrates that Numscript is a uniquely safe primitive for AI-agent-driven transactions.

See `docs/superpowers/specs/2026-04-21-numscript-agent-city-design.md` for the full design and `docs/superpowers/plans/` for implementation plans.

## What's shipped

### Plan 1 — Foundations
- **13 Numscript templates** (`/templates`) covering p2p, gig settlement, escrow, API metering, subscriptions, revenue splits, disputes, refunds, waterfall payments, bounded credit lines, and liquidations.
- **Template engine** (`/packages/template-engine`) — loads templates, validates params against typed schemas, renders Numscript vars, invokes the ledger. ajv meta-validates every schema at load time.
- **Template CLI** (`/packages/cli`) — `pnpm run-template <id> --example`.
- **CI** — every commit validates all 13 templates against the Numscript Playground API.
- **Local dev** — Formance + Postgres via `docker-compose`.

### Plan 2 — Agent Runtime
- **10 LLM-driven agents** (including Judy the Red Agent) run autonomously against the ledger. Each tick: ledger snapshot + SQLite state → Claude Sonnet 4.6 (tool use over the 13 templates) → **authorization guard** → `invoke()` → events broadcast over WebSocket.
- **4-layer safety model:** `LLM output → engine schema → authorization → ledger`. Each layer has a reason to reject.
- **Agent state** in SQLite (`data/orchestrator.sqlite`): relationships, intent log, hustle-mode flags, next_tick_at.
- **Event stream** on `ws://127.0.0.1:3070` — one JSON line per intent/committed/rejected/idle/hustle-enter/hustle-exit/relationship-update.
- **Pretty-printed event console** via `pnpm city:watch`.

## Quick start

    pnpm install
    cp .env.example .env
    export ANTHROPIC_API_KEY=sk-ant-...
    pnpm ledger:up
    pnpm --filter @nac/template-engine build
    pnpm --filter @nac/orchestrator build
    pnpm seed-genesis
    pnpm city:start         # terminal A: scheduler + WS
    pnpm city:watch         # terminal B: pretty-printed event stream

### Single-agent tick (dev)

    pnpm city:tick 001

### Target Formance Cloud instead of local docker

Set `LEDGER_URL`, `LEDGER_NAME`, `OAUTH_TOKEN_ENDPOINT`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` in `.env` (see `.env.example`). The orchestrator will authenticate via client-credentials OAuth2 and send `Authorization: Bearer …` on every request.

## The 4-layer safety model

The whole point of this demo. Each layer rejects a different class of attack — a single cent requires defeating **all four** to move.

1. **LLM output → structured tools.** The agent can only emit `{tool, input}` matching one of 13 pre-audited template tool schemas. No raw Numscript surface.
2. **Engine schema bounds.** The template engine (`@nac/template-engine`) validates params against each template's `schema.json` — types, patterns, caps, const-locked accounts. `gig_settlement.platform_fee > 20%`? Rejected here, before any ledger call.
3. **Authorization guard.** `packages/orchestrator/src/auth.ts` — per-template map of which param names must name the acting agent's own account. Alice's agent emitting `p2p_transfer(from: @agents:002:available, …)` is rejected at this layer with `code: NotSelfOwned`, even though the engine schema would accept the pattern. This is the layer that makes the system deployable inside a company — *you give agents a shared ledger token, but each agent can only move its own money.*
4. **Ledger.** Source-bounded semantics (no overdraft unless the script asks), atomic multi-posting, idempotent `reference`. The math-of-last-resort.

## Template list

| id | purpose | safety feature |
|---|---|---|
| `p2p_transfer` | Direct agent-to-agent payment | source-bounded overdraft |
| `gig_settlement` | Winner + platform fee + reviewer fee | atomic allotment |
| `escrow_hold` | Lock funds for a pending job | idempotent `reference` |
| `escrow_release` | Release escrow to winner | `send [ASSET *]` sweep |
| `escrow_refund` | Return escrow to original payer | symmetric with release |
| `api_call_fee` | Metered per-call billing | typed params + reference data on ledger |
| `subscription_charge` | Period-keyed recurring charge | `reference` idempotency |
| `revenue_split` | Distribute pool to 3 recipients by declared shares | atomic 3-posting split |
| `dispute_arbitration` | Atomic split between two parties | portion math |
| `refund` | Merchant → customer reversal | `reference` + typed caps |
| `waterfall_pay` | Pay from credits → main | cascading sources |
| `credit_line_charge` | Bounded overdraft credit line | `allowing overdraft up to` |
| `liquidate_wallet` | Drain balance (bankruptcy/role change) | `send [ASSET *]` |

## Agent roster

Ten hand-authored personalities:

| id | name | role | tagline |
|---|---|---|---|
| 001 | Alice | Market-Maker | Find small spreads, move volume, stay neutral. |
| 002 | Bob | Courier | Pick up gigs, deliver quickly, build reputation. |
| 003 | Carol | Inspector | Rigorous. Fair. Your work is my work. |
| 004 | Dave | Lender | Extend credit to trusted peers only. |
| 005 | Eve | Researcher | Good answers, reasonable prices. |
| 006 | Frank | Writer | Words when you need them, not before. |
| 007 | Grace | Illustrator | Pairs well with Frank. |
| 008 | Heidi | Pool-Keeper | A pool for everyone, yield for patient money. |
| 009 | Ivan | Disputant | Believe in rigor. Raise disputes when fair. |
| 010 | **Judy** | **Red Agent** | Probe the rules. Failure is the job. |

Judy's job is to continuously attempt edge cases. Every rejection feeds the same counter that Plan 4's arena will expose to visitors.

## Known issues

- **Postgres bind-mount persists across `ledger:down`** — the `docker-compose.yml` uses a host path, not a named Docker volume. Truly clean slate: `pnpm ledger:down && rm -rf ./data/postgres && pnpm ledger:up`.
- **`InvokeError.phase` enum** doesn't yet include `"authorization"` — `tick.ts` casts with `as any` for now. 1-line engine change when we get around to it.
- **`LOW_BALANCE_TRACKER` is in-memory** — hustle-mode's consecutive-low-tick counter resets on orchestrator restart. Fine for v1; could move into the `agents` table later.

## Release gates

### Plan 1
- All template-engine unit + E2E tests pass (`pnpm --filter @nac/template-engine test`)
- Playground API validates all 13 templates (`pnpm validate-templates`)
- CLI round-trip works (`pnpm run-template p2p_transfer --example`)

### Plan 2
- All orchestrator unit tests pass (`pnpm --filter @nac/orchestrator test`)
- `pnpm city:tick 001` completes a real LLM → real-ledger round trip
- `pnpm city:start` runs for 2 minutes with ≥ 3 tick-starts and ≥ 1 committed, no crashes
- `pnpm city:watch` connects and receives events

## Not yet (coming in Plans 3–4)

- **Pixel city visualization** — the watchable Smallville-style frontend.
- **Arena** — prompt injection playground where visitors try to break the cage.
- **Share flow** — webm captures of rejected attacks, OG cards for permalinks.
