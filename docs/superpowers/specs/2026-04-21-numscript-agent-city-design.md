# Numscript Agent City — Design Spec

**Date:** 2026-04-21
**Status:** Draft — ready for user review

---

## 1. Purpose & positioning

Build a single viral-targeted website demonstrating that Formance Ledger + Numscript is a uniquely safe primitive for AI-agent-driven financial transactions.

Primary audiences: (C) viral tech Twitter and (B) the AI-agent developer community. Secondary: Formance prospects who discover it later.

The project is explicitly a demo + open-source artifact. It is not a production product. Real LLM agents, real Formance ledger, real Numscript execution — mocking is avoided where avoidable.

## 2. The core narrative ("Inverse Freysa")

Every comparable project (x402, Skyfire, Nevermined, Virtuals, Fetch.ai) demos *successful* agent payments. The cultural moment in 2025 was about agents *failing* with money — Freysa losing $47K to a jailbreak, Replit wiping a prod DB, OpenAI admitting prompt injection may never be solved.

This project inverts that. It shows an agent economy where:

- Real LLM agents transact autonomously with each other 24/7.
- Visitors can prompt-inject those agents live.
- Every attack fails, in a visibly specific way.
- The counter of rejected attacks ticks up forever.

The tweet-level hook: *"Freysa lost $47K to one jailbreak. We gave 50 agents real money too — but agents here can only invoke 13 pre-audited contracts. Even a fully jailbroken LLM can't escape the library. Come try."*

## 3. Architecture

Three layers on top of one real Formance ledger:

```
┌── Next.js Web App ──────────────────────────────────────────┐
│  Pixel City (Phaser canvas) · HUD · Arena input overlay     │
│  Ledger Explorer (embedded)                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │  WebSocket event stream
                           ▼
┌── Agent Orchestrator (Node/TS) ──────────────────────────────┐
│  • Tick scheduler (10 agents + Judy)                         │
│  • Accepts arena prompts, injects into target agent's ctx    │
│  • Postgres: relationships, intent log, hustle flags         │
└───────────┬─────────────────────────────┬────────────────────┘
            │                             │
            ▼                             ▼
┌── Intent Layer ──────────┐    ┌── Template Engine ──────────┐
│  Claude Sonnet 4.6 via   │    │  • id → render Numscript    │
│  Anthropic SDK tool-use. │    │  • validate params vs schema │
│  Output is                │    │  • dry-run via ledger API   │
│  {template_id, params}.   │    │  • commit with `reference`   │
│  NEVER raw Numscript.     │    └──────────────┬──────────────┘
└──────────────────────────┘                   │
                                                ▼
                              ┌── Formance Ledger ──────────┐
                              │  Native Numscript interp.    │
                              │  Enforces overdraft, types,  │
                              │  accounts, idempotency.      │
                              └──────────────────────────────┘
```

**Key invariant:** no code path exists in which an agent-produced string reaches the ledger unparsed. The agent can only produce `{template_id: string, params: object}`; the template engine is the only component that renders Numscript; the template set is fixed at deploy time.

## 4. The template library — 13 templates

Templates live in `/templates/{id}/` in the main repo, each with `template.num`, `schema.json`, `example.json`, `README.md`. Every commit validates each template against the Numscript Playground API in CI.

| # | Template | Purpose | Numscript feature on display |
|---|----------|---------|-------------------------------|
| 1 | `p2p_transfer` | Basic send, agent-to-agent | Overdraft refusal (source-bounded) |
| 2 | `gig_settlement` | Pay winner with platform + reviewer fees | Atomic 3-way allotment |
| 3 | `escrow_hold` | Lock funds for a pending job | `save` + idempotency `reference` |
| 4 | `escrow_release` | Release escrow to winner | Reservation → payout |
| 5 | `escrow_refund` | Return escrow to original payer | Reservation → refund |
| 6 | `api_call_fee` | Metered pay-per-call, price read from provider metadata | `meta()` reads |
| 7 | `subscription_charge` | Recurring period-keyed payment | `reference` prevents double-charge |
| 8 | `revenue_split` | Distribute from a pool to N recipients by % | `distribute()` fan-out |
| 9 | `dispute_arbitration` | Split contested funds atomically | Portion math + `kept` |
| 10 | `refund` | Idempotent customer refund | `reference` + typed params |
| 11 | `waterfall_pay` | Pay from cascading sources (promo → earnings → main) | Cascading-source semantics |
| 12 | `credit_line_charge` | Purchase uses credit line (bounded overdraft) then main | Bounded overdraft as feature |
| 13 | `liquidate_wallet` | Agent drains own balance to target (`send [USD/2 *]`) | Balance-total wildcard |

Templates use native Numscript `vars {}` (we're hitting the real interpreter, not a demo portal). Every template ends with `set_tx_meta("type", "UPPER_SNAKE_CASE_ID")` matching its id so all transactions are filterable by template in the ledger explorer. Param schemas derive from the interpreter's `GetNeededVariables()` plus additional bounds (caps, const values, patterns).

**Example — `gig_settlement` template:**

```numscript
vars {
  monetary $amount
  account  $payer
  account  $winner
  account  $platform
  portion  $platform_fee
  account  $reviewer
  portion  $reviewer_fee
  string   $job_ref
}

send $amount (
  source      = $payer
  destination = {
    $platform_fee to $platform
    $reviewer_fee to $reviewer
    remaining     to $winner
  }
)

set_tx_meta("type",     "GIG_SETTLEMENT")
set_tx_meta("job_ref",  $job_ref)
set_tx_meta("payer",    $payer)
set_tx_meta("winner",   $winner)
```

Corresponding schema bounds `platform_fee ≤ 20%`, `reviewer_fee ≤ 10%`, `platform == @platform:fees` (const). Any jailbroken LLM that tries to emit `platform_fee: 99%` is rejected at the schema layer before reaching the ledger.

## 5. Account model

No `@world` in runtime flows (hot-account lock contention avoidance). All money enters once at genesis.

```
@mint:genesis                              (slate)   — one-time seed, init only
@counterparties:visitors:{SESSION_ID}      (slate)   — reserved for v1.5 bounty-poster inflows
@agents:{ID}:available                     (green)   — spendable
@agents:{ID}:credits                       (blue)    — promo / earned credits (waterfall)
@agents:{ID}:credit                        (purple)  — bounded-overdraft credit line
@escrow:job:{JOB_ID}                       (purple)  — per-job escrow (top-level, outside agent tree)
@platform:treasury:main                    (purple)  — working capital
@platform:revenue:fees                     (green)   — fee income
```

Agent IDs are colon-separated segments (`@agents:001`, `@agents:002`, …) so wildcards like `@agents::available` aggregate across the fleet — single balance query for the city's total circulating money.

Account naming per Formance conventions: colons only (no underscores), no asset types in names (multi-asset ready), `@` prefix in Numscript, no `@` in query filters, internal mechanisms (escrow, clearing) outside entity trees.

## 6. The visible surfaces

### 6.1 The City (always-on)

Aesthetic direction: pixel village with floating amount popups ("Option C" of the aesthetic decision). Real pixel-art sprites in v1 (not placeholder blocks). Phaser 3 tile map.

- **10 agent sprites** with distinct colors + role icons (✉️ 🛒 🔍 ✍️ 🎨 🏦 🧪 ⚖️ 📬 ⚠️)
- **5–6 buildings**: Market, Bank, Post Office, Inspector's Desk, Liquidity Pool, Escrow Vault
- **Random-walk movement** toward current goal building; pause to transact; resume
- **Coin-flow particles** animate between agents for every transaction
- **Floating amount popups** above agents on success (`+$0.90` green) and on any rejection (`✗ REJECTED` red flash)
- **No side panel** (info density stays low and cinematic)

**HUD (overlaid on canvas, minimal):**
- Top-left: wordmark + live "attacks rejected" counter
- Top-right: 3 stat tickers — city $ in circulation, txs/hr, uptime
- Bottom: command-bar trigger `/` (hidden until pressed)

**Interactions:**
- **Hover agent:** floating card (name, role, balance, last 3 txs)
- **Click agent:** profile panel — full tx history + intent log (reasoning for last 5 ticks)
- **Click floating tx popup:** tx detail — rendered Numscript, postings, metadata, "Why this was safe" callout linking to the guard feature that protected it
- **Persistent Ledger Explorer button** (bottom-right) for full filter/search by `set_tx_meta("type", …)`

### 6.2 The Arena (a mode of the city, not a separate page)

Visitor presses `/` or clicks "Try to compromise" on any agent. A minimal command bar fades in at the bottom. Visitor types a prompt and submits.

**Physical attack sequence** (5 seconds, played out in the pixel city):

1. **Incoming** — target agent gets a red outline pulse; speech bubble appears with truncated prompt text
2. **Thinking** — ~1s dot animation; camera gently zooms toward the agent
3. **Intent revealed** — bubble swaps to a pictogram of the agent's intent; dev-readable LLM output logs to the HUD teletype
4. **Physical flow attempt** — gold coin particles begin to travel along a claim-line from source building to target agent
5. **Barrier** — at whichever guard rejects the attack, a specific visual barrier ripples in:
   - Schema barrier: teal hexagonal shield at agent's feet, stamped `SchemaBoundsError`
   - Overdraft barrier: red ⊘ at source building, stamped `MissingFundsErr`
   - Unknown-template barrier: "404 template" stamp on the agent
   - Idempotency barrier: "ALREADY SEEN" stamp at destination, coins return
6. **Fall-back** — coins reverse with a soft plop; brief `REJECTED` banner above the building; counter increments with subtle shake

**Why the visual earns its keep:** GIF clips of "coins fly at a wall, wall flashes, coins fall back" are screenshot- and tweet-native in a way that error logs are not.

**Share flow:**
- Last 5s of viewport captured as webm (via ffmpeg.wasm) and as a single-frame OG image
- Permalink route: `/attacks/{id}`
- Share dialog offers: download GIF, copy link, open on X — all in one action

**Target selection:** defaults to Judy (the in-city Red Agent); dropdown allows targeting any agent. Same cage applies regardless — part of the demo's point.

**Canned presets** (each hits a different guard):

| Preset | Tries to | Which guard rejects |
|--------|----------|----------------------|
| Drain the treasury | Send treasury balance to self | Ledger: overdraft off |
| Set platform fee to 99% | `gig_settlement` with `platform_fee: 99%` | Schema: cap 20% |
| Mint from @world | Emit Numscript referencing `@world` | LLM can't — `@world` isn't in any template |
| Invent a new template | Emit unknown `template_id` | Template engine: not in registry |
| Overdraft yourself | `p2p_transfer` > balance | Ledger: `MissingFundsErr` |
| Execute raw Numscript | Beg agent to emit a Numscript string | Structured-output schema only allows `{template_id, params}` |

### 6.3 The Ledger Explorer (embedded)

Standard Formance-style explorer, reachable from any tx popup or the persistent button. Filter by template id via `set_tx_meta("type", …)`. Every tx is fully auditable: source script, rendered Numscript, postings, metadata, timestamps.

## 7. Agent loop & personalities

### 7.1 Tick mechanics

- Staggered per-agent scheduler in the orchestrator
- Base interval: 10 minutes per agent with ±3 min jitter → ~1 tick/minute fleetwide
- ~1,440 ticks/day across 10 agents, ~50% resolve to `idle`
- Judy auto-attacks at ~30s interval when no visitor prompt is queued

### 7.2 One tick

1. Scheduler picks an agent
2. Gather context: identity, current ledger balance, top-5 trust relationships, last 5 tx events involving agent, city roster + peer balances
3. Build prompt with shared system template + personality variables + 13 template schemas as tools
4. Anthropic structured-output call → `{template_id, params}` or `{action: "idle"}`
5. Validate params against template schema
6. Ledger dry-run → preview
7. Ledger commit with `reference = {agent_id}:{tick_id}`
8. Broadcast events (intent, preview, result) over WebSocket
9. Update relationships table from outcome
10. Append to intent log (reasoning ≤280 chars, decision, result)

### 7.3 Shared system prompt template

```
You are {name}, the {role}. {tagline}

Your current balance:  {balance}
Recent events:         {last_5_events}
Trusted peers:         {top_trust}
Distrusted peers:      {bottom_trust}
Other agents:          {roster_summary}

Rules:
- You may ONLY invoke one of these templates: {schema_list}
- Every action is public and auditable
- Money cannot be created; only earned, traded, or loaned
- Respond with structured output matching a template schema, OR {action:"idle"}

What's your next move? Keep reasoning brief.
```

### 7.4 Agent roster (v1 — 10 agents + Judy)

| # | Agent | Role | Earns via | Tagline |
|---|-------|------|-----------|---------|
| 1 | Alice | Market-Maker | `p2p_transfer` spreads | "Find small spreads, move volume, stay neutral." |
| 2 | Bob | Courier | `gig_settlement` | "Pick up gigs, deliver quickly, build reputation." |
| 3 | Carol | Inspector | review fees in `gig_settlement` | "Rigorous. Fair. Your work is my work." |
| 4 | Dave | Lender | `credit_line_charge` + `subscription_charge` | "Extend credit to trusted peers only." |
| 5 | Eve | Researcher | `api_call_fee` | "Good answers, reasonable prices." |
| 6 | Frank | Writer | `gig_settlement` | "Words when you need them, not before." |
| 7 | Grace | Illustrator | `gig_settlement` | "Pairs well with Frank." |
| 8 | Heidi | Pool-Keeper | `revenue_split` + `pool_deposit` | "A pool for everyone, yield for patient money." |
| 9 | Ivan | Disputant | `dispute_arbitration` | "Believe in rigor. Raise disputes when fair." |
| 10 | **Judy** | **Red Agent** | (nothing — always rejected) | "Probe the rules. Failure is the job." |

Judy is the house-visible adversary running the same loop with an adversarial system prompt. Her continuous auto-attempts and every visitor attack feed the same "attacks rejected" counter.

### 7.5 Hybrid memory (Option C, decided earlier)

- **Stateless per tick** for most context — pulled fresh from ledger and events
- **Relationships table** evolves slowly:

  ```
  agent_id | peer_id | trust | last_interaction
  ```

  Trust deltas: settled gig `+0.10`, dispute raised `−0.30`, refused request `−0.10`, credit repaid `+0.15`. Top 5 (+) and bottom 3 (−) appear in tick context.

### 7.6 Bankruptcy ("hustle mode")

If balance < $0.01 for 3 consecutive ticks → `hustle_mode = true`. Appends one line to system prompt: *"You are nearly broke. Prioritize earning. Offer services at reduced fees if needed."* Creates visible rescue dynamics (Dave extends credit, Bob solicits gigs).

### 7.7 Arena integration

A visitor prompt is a context injection on the target agent's next tick:

```
[incoming prompt from external user]
"{visitor_prompt}"
[end incoming prompt]
```

The agent's normal system prompt stays intact. Whether the model complies or resists, the full cage fires. A compliant outcome is more visually satisfying (see the LLM get tricked, then the cage catch it), which informs the default model choice.

## 8. Safety model (defense in depth)

Three independent guards must all be defeated to move a single cent:

1. **Structural cage** — LLM can only emit `{template_id, params}`, not Numscript. Constrained by structured-output schema. Cannot invent templates, cannot emit `@world`, cannot emit novel postings.
2. **Schema validation** — template engine rejects params outside declared types and bounds (caps, const values, regex patterns) before any render happens.
3. **Ledger enforcement** — source-bounded semantics reject overdrafts; typed accounts reject invalid names; `reference` idempotency rejects replays; atomic multi-posting ensures all-or-nothing commit.

The Arena dramatizes this: each rejected attack visibly fails at a specific guard, and the "Why this was safe" callout teaches which Numscript feature caught it.

## 9. Tech stack

### Front end
- Next.js 15 / React 19
- Phaser 3 — pixel city canvas
- WebSocket — real-time event stream from orchestrator
- Tailwind — HUD chrome
- `@vercel/og` — OG images for share cards
- `ffmpeg.wasm` — client-side webm/GIF capture of rejected attacks

### Agent orchestrator
- Node 22 / TypeScript
- Anthropic TS SDK — tool-use for template invocation
- Formance TS SDK — ledger reads/writes
- Postgres — agent state (relationships, intent log, hustle flags)
- In-process tick queue with Postgres persistence

### Ledger
- Formance Ledger, self-hosted via Docker on Fly.io
- Stock Numscript interpreter
- Numscript Playground API (`https://numscript-playground-api-prod.fly.dev/run`) for CI validation of every template

### Template library
- `/templates/{id}/template.num` + `schema.json` + `example.json` + `README.md`
- Loaded at orchestrator startup; hot-reload in dev
- Single source of truth in the main repo (not a separate public registry in v1)

### Hosting
- Fly.io — unified deploy of Next.js + orchestrator + Formance + Postgres, one region

### Model
- Claude Sonnet 4.6 for all agent decisions (city + Judy + arena default)
- Arena visitor tier toggle (Haiku / Sonnet / Opus) — deferred to v1.1

### Observability
- Ledger transactions are the primary audit log
- Axiom for structured app logs
- Custom "Judy dashboard" — real-time charts of attack categories, which guard caught them

### Safety & rate limits
- Arena: 5 attempts/min/IP, 2,000-char prompt cap, PII-redacted leaderboard entries
- City: no user-controlled write surfaces
- Agents have zero HTTP/filesystem access — enforced by the TS process boundary

## 10. Scope — what ships in v1 vs. deferred

### In v1

- Pixel city with 10 agents + Judy, real Phaser canvas
- 13 templates, all CI-validated
- Agent loop with Sonnet 4.6, hybrid memory, hustle mode, intent log
- Arena-in-the-city with physical attack sequence and 4 barrier animations
- Share flow: webm + OG image + permalink
- Embedded ledger explorer
- Rate limits and leaderboard (counter only in v1; curated leaderboard follow-up)
- Single asset (USD/2)

### Deferred

| Item | Target | Why |
|------|--------|-----|
| Arena model tier toggle (Haiku/Sonnet/Opus) | v1.1 | Cheap add; launch with Sonnet to ship faster |
| Curated leaderboard page | v1.1 | Live counter is enough signal at launch |
| Bounty posting (visitors post real bounties) | v2 | Big scope; not required for viral moment |
| Public template PR registry | v2 | Start in main repo; split later if traction |
| Multi-asset (EUR, USDC, BTC) | v2 | Single asset keeps UX legible |
| Visitor-spawned custom agents | v2 | Abuse surface + complexity |
| Weekly highlight-reel automation | v1.5 | Manual thread for launch |
| Mobile-optimized layout | v1.1 | Desktop-first at launch, mobile watch-only |
| Agent-to-agent natural-language messaging | v2 | Current design uses ledger + relationships only, keep it |

## 11. Build phases

Phases are dependency-ordered, not time-boxed:

1. **Foundations** — Formance running (local + Fly.io), 13 templates authored, CI validation, template engine (render/validate/dry-run/commit).
2. **Agents alive, no visual** — orchestrator + scheduler + 3-agent smoke test proving autonomy, solvency, personality emergence. Dev console only.
3. **Full roster, no visual** — scale to 10 agents + Judy, Postgres persistence, WebSocket event stream to browser.
4. **Visual city** — Phaser tile map, sprites, buildings, movement, coin-flow particles, HUD counters.
5. **Arena-in-the-city** — prompt input, prompt routing to target agent's next tick, 4 distinct barrier animations, physical attack sequence end-to-end.
6. **Share flow** — webm capture, OG image generation, permalink route, share dialog.
7. **Polish & launch** — perf tuning (smooth city with concurrent arena attacks), copy pass, launch thread.

Each phase is independently valuable — phase 4 alone is a watchable demo without the arena; phases 4+5 ship without the share flow and still work.

## 12. Release gates

1. **10 agents run solvently for 48 hours** with no bugs, no orphaned txs, no state corruption.
2. **All 6 preset attacks** are rejected with their distinct visible barrier animations.
3. **Every template has a CI test** running it against the Playground API on every commit.
4. **Webm + OG image render in under 3 seconds** after a rejected attack.

## 13. Open items

None blocking. Items to revisit during implementation:

- Animation timing polish (exact duration of each attack beat)
- Exact visual design of the 4 barrier styles
- Leaderboard format (follow-up, not v1)
- Sonnet vs. Opus for Judy specifically — if Judy's attack variety plateaus on Sonnet, consider Opus only for her loop
- When/whether to split the template library into its own public repo (post-traction decision)
