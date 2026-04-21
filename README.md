# Numscript Agent City

An agent economy demo on Formance Ledger. Demonstrates that Numscript is a uniquely safe primitive for AI-agent-driven transactions.

See `docs/superpowers/specs/2026-04-21-numscript-agent-city-design.md` for the full design.

## What's in this foundations milestone

- **13 Numscript templates** (`/templates`) covering p2p, gig settlement, escrow, API metering, subscriptions, revenue splits, disputes, refunds, waterfall payments, bounded credit lines, and liquidations.
- **Template engine** (`/packages/template-engine`) — loads templates from disk, validates params against typed schemas, renders Numscript vars, dry-runs and commits via Formance.
- **CLI** (`/packages/cli`) — `pnpm run-template <id> --example` invokes any template end-to-end.
- **CI** — every commit validates all 13 templates against the Numscript Playground API.
- **Local dev** — Formance + Postgres via `docker-compose`; one-command bring-up.

## Quick start

    pnpm install
    cp .env.example .env
    pnpm ledger:up
    pnpm --filter @nac/template-engine build   # one-time — workspace consumers need dist/
    pnpm seed-genesis
    pnpm run-template p2p_transfer --example

## Template list

| id | purpose | feature |
|---|---|---|
| `p2p_transfer` | Direct agent-to-agent payment | source-bounded overdraft |
| `gig_settlement` | Winner + platform fee + reviewer fee | atomic allotment |
| `escrow_hold` | Lock funds for a pending job | idempotent `reference` |
| `escrow_release` | Release escrow to winner | `send [ASSET *]` sweep |
| `escrow_refund` | Return escrow to original payer | symmetric with release |
| `api_call_fee` | Metered per-call billing (amount computed off-chain from provider's `unit_price` metadata) | typed params + reference data on ledger |
| `subscription_charge` | Period-keyed recurring charge | `reference` idempotency |
| `revenue_split` | Distribute pool to 3 recipients by declared shares | atomic 3-posting split |
| `dispute_arbitration` | Atomic split between two parties | portion math |
| `refund` | Merchant → customer reversal | `reference` + typed caps |
| `waterfall_pay` | Pay from credits → earnings → main | cascading sources |
| `credit_line_charge` | Bounded overdraft credit line | `allowing overdraft up to` |
| `liquidate_wallet` | Drain balance (bankruptcy/role change) | `send [ASSET *]` |

## Known issues (v1)

- **Persistent Postgres state:** `pnpm ledger:down` does not wipe the database — it uses a host bind-mount (`./data/postgres`). For a truly clean slate: `pnpm ledger:down && rm -rf ./data/postgres && pnpm ledger:up`.
- **Dry-run persistence:** Formance Ledger v2.3.1 appears to persist state on `?dry_run=true` calls (under investigation). `invoke()` therefore commits twice per template run — idempotency via `reference` ensures correctness, but tx counters advance 2×. To be reported upstream.
- **`account_list` param type is dead code:** kept in the engine (`types.ts`, `renderer.ts`, `validator.ts`) for future use with `distribute()` once Formance ships it on the public Playground.

## Not in this milestone

No agents, no front-end, no arena. Those ship in Plans 2–4 (see `docs/superpowers/plans/`).
