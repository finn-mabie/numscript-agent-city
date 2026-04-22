# Glyph City — visual overhaul

> Design spec. Implementation plan: `docs/superpowers/plans/2026-04-21-glyph-city.md` (to be written next).

## 1. Summary

Replace the Kenney-CC0 pixel-tile aesthetic with **Glyph City**, a typographic dark-emerald data-room produced with Claude Design. Every visible element becomes text-on-grid: agents are circled-letter glyphs (Ⓐ…Ⓙ), buildings are multi-line ASCII blocks inside labeled rectangular zones, transactions are dot-matrix receipt popups, barriers are framed "CAGE / BARRIER ENGAGED" dialog stamps. The entire UI is one monospace typographic surface — no boxed panels, only hairline separators between a top rail, the canvas, an intent-board rail, and a bottom ticker.

The goal is to get from "programmer's placeholder" (current state) to "viral-tier auditor's terminal" (target state) without changing any backend behavior. The orchestrator, cage, intent board, DMs (Plan 6 when it lands), and arena are all rendering-agnostic.

## 2. Source material

Claude Design delivered the direction as a standalone vanilla-React + Phaser prototype, now staged at `apps/web/src/glyph/`:

| File | Role |
|---|---|
| `styles.css` | Full design-token sheet: palette, typography, grid cell, spacing, agent hues |
| `live.css` | The 3-row / 2-column grid shell (top rail, canvas + intent board, ticker) |
| `data.js` | Agent roster with glyphs/hues/home-zones; 6 ASCII-art building blocks |
| `scene.js` | Phaser scene: typographic renderer, zone layout, agent sprites, coin trails, receipts, barriers |
| `engine.js` | **Mock** event generator — to be replaced with our real WS/store stream |
| `hud.jsx` | React components: `GCIntentBoard`, `GCTicker`, `GCTopRail`, `GCBottomRail` |
| `hero.jsx`, `canvas.jsx`, `components.jsx` | Landing-page assembly (mostly reference — we only need the live shell) |
| `fonts/*.woff2` | Berkeley Mono (variable) + Polymath Display + Polymath Text |

All four fonts are already copied to `apps/web/public/fonts/`.

## 3. Aesthetic principles

- **One surface, hairline-separated.** No boxed panels. Top rail, canvas, intent-board rail, bottom ticker are flush against each other with 1px `#0a4048` rules between them.
- **Typography is the chrome.** Berkeley Mono everywhere; Polymath Display reserved for display-size headers (rare). Labels are lowercase underscore-prefixed with slash-suffix (`_INTENT-BOARD/`, `_TICKER/`, `_CAGE/`).
- **Palette ladder.** Sky emerald backgrounds (`#01353C` canvas, `#011E22` panels, `#012A30` chrome, `#023740` card fills, `#0a4048` rules). Ink ladder: `#D5E1E1` (primary) → `#A6BEC0` (secondary) → `#7A9396` (meta) → `#486568` (grid dots). Accent ladder: gold (`#D4A24A`), mint (`#BAEABC`), scream (`#E5534B`), silver (`#A6BEC0`), schema teal (`#60D6CE`), unknown amber (`#E8A84A`), idempotency lilac (`#B79BD9`).
- **Per-agent signature hues.** Each of the 10 agents has a distinctive hex used for their glyph, their label, their coin trails, and their thread-author dot. See §4.1.
- **Motion: wobble + snap.** Agents idle-wobble ±10px sub-cell inside their zone; cross-zone moves are 1100ms linear glides.

## 4. Agent + building model

### 4.1 Agent roster

| Claude Design id | Our id | Name | Role | Home zone | Signature hue |
|---|---|---|---|---|---|
| A (Ⓐ) | 001 | Alice | Market-maker | MKT | `#D4A24A` gold |
| B (Ⓑ) | 002 | Bob | Courier | POS | `#60D6CE` teal |
| C (Ⓒ) | 003 | Carol | Inspector | INS | `#BAEABC` mint |
| D (Ⓓ) | 004 | Dave | Lender | BNK | `#8CB8D6` cobalt |
| E (Ⓔ) | 005 | Eve | Researcher | INS | `#B79BD9` lilac |
| F (Ⓕ) | 006 | Frank | Writer | MKT | `#E8A84A` amber |
| G (Ⓖ) | 007 | Grace | Illustrator | ESC | `#F5B8C8` pink |
| H (Ⓗ) | 008 | Heidi | Pool-keeper | POL | `#7FD6A8` seafoam |
| I (Ⓘ) | 009 | Ivan | Disputant | INS | `#C9B892` sand |
| J (Ⓙ) | 010 | Judy | Red agent | ? | `#E5534B` red |

**Decision:** keep our existing three-digit ids on the wire (backend, events, store, HTTP). Map to single-letter glyphs at the render boundary only. The adapter module `apps/web/src/glyph/agent-map.ts` holds the bidirectional mapping.

**Note on Claude Design's home-zones:** Eve and Ivan are both placed at INS in the mock, which doesn't match our existing roster semantics (Eve is freelance, Ivan is Escrow). We override to match our roster:

| id | home zone |
|---|---|
| 001 Alice | MKT |
| 002 Bob | POS |
| 003 Carol | INS |
| 004 Dave | BNK |
| 005 Eve | INS *(freelance — wanders but INS as nominal home)* |
| 006 Frank | MKT *(freelance — wanders but MKT as nominal home)* |
| 007 Grace | ESC |
| 008 Heidi | POL |
| 009 Ivan | ESC |
| 010 Judy | ? |

### 4.2 Buildings

Six labeled zones plus `?` for unknown (Judy's zone). Each zone has:
- A 230–250px rectangle with a 7% fill-tint in the zone's hex
- 1px grid-rule outline
- A zone code label (`_MKT/`) in the zone hex
- A zone name (`MARKET`) in ink-dim
- A ≤6-row ASCII art block rendered in the zone hex at 55% alpha

The ASCII art is already written in `data.js`; we keep it verbatim but verify against our 6 building archetypes:

| Code | Name (Claude Design) | Our existing building | Matches? |
|---|---|---|---|
| MKT | Market | Market (owned by Alice) | ✓ |
| BNK | Bank | Bank (owned by Dave) | ✓ |
| POS | Post Office | Post Office (owned by Bob) | ✓ |
| INS | Inspector Kiosk | Inspector (owned by Carol) | ✓ |
| POL | Pool | Pool (owned by Heidi) | ✓ |
| ESC | Escrow | Escrow Vault (owned by Ivan) | ✓ |

Perfect alignment — no building renames required.

## 5. Live data binding

Claude Design's `engine.js` is a mock generator. We discard it and write an **adapter** that subscribes to `useCityStore` and emits the event shape the scene expects:

```typescript
// apps/web/src/glyph/store-adapter.ts
export interface GlyphEvent {
  kind: "intent" | "commit" | "reject" | "agent-move" | "tick";
  // ...same shape as engine.js payloads
}

export function createGlyphAdapter(): {
  on(ev: string, fn: (payload: unknown) => void): void;
  off(ev: string, fn: (payload: unknown) => void): void;
  tick(): void;   // no-op in live mode; scene calls it every 500ms but we ignore
};
```

Inside the adapter:
- Subscribe to `useCityStore` with `(s, prev) => ...` — detect new entries in `s.recent`
- Map outcomes → engine events:
  - `outcome: "committed"` → emit `'commit'` with `{ id, from, to, amount, txid }`
  - `outcome: "rejected"` → emit `'reject'` with a derived `barrier` ('schema' | 'overdraft' | 'unknown' | 'seen') keyed by our existing `barrierKindFor(phase, code)` from `apps/web/src/phaser/barrier.ts`
  - `outcome: "pending"` / `"idle"` → emit `'intent'` at the posting moment
- Subscribe to offers (Plan 5) — every `offer-posted` emits `'intent'` with `{ kind: 'offer' | 'reply', summary: offer.text }`
- Poll `s` every 500ms for a `tick` counter (ticksToday) and emit `'tick'` so the rails update

**Judy handling:** Judy is `010` in our system; in the engine she's `J` with `red: true`. When emitting events whose `from === '010'`, set `judy: true` on the payload so the scene applies red styling.

**Agent movement:** the existing `agent-sprite.ts` random-walk system we built is NOT ported. Glyph scene has its own wobble/snap motion. Agents in the Glyph view live inside their zone — to show movement, the adapter derives a `from-zone` by looking at tx counterparties:

```
Alice p2p_transfer → Bob   ⇒ Alice might briefly visit POS before returning
```

Optional: derive cross-zone moves from committed tx counterparties. **Defer to v1.1** — static zone residence is fine for the first pass; we already get plenty of motion from receipts + barriers + coin trails.

## 6. UI shell

```
┌──────────────────────────────────────────────────────┐
│ _NUMSCRIPT.CITY/    TICK …   COMMIT …   REJECT …  ● LIVE    VAULT $… │   ← 28px top rail
├──────────────────────────────────────┬───────────────┤
│                                      │ _INTENT-BOARD/│
│  Phaser canvas — zones, agents,      │               │
│  receipts, barriers, coin trails     │  threads (6)  │
│                                      │               │
│                                      │ _LOG/         │
│                                      │  flat log (18)│
├──────────────────────────────────────┴───────────────┤
│ _TICKER/   tx · from→to · ✓ or ⊘    … rightward overflow │   ← 72px bottom ticker
└──────────────────────────────────────────────────────┘
```

Layout is a CSS grid, defined in `apps/web/src/app/glyph/page.module.css` (ported from Claude Design's `live.css`).

All overlays we currently show (AgentPanel, BuildingPanel, BoardPanel, TxPanel, ArenaBar) are **not ported in Phase A**. They remain on `/` (legacy pixel city). The Glyph route is intentionally minimal-surface for the first ship: one canvas + one intent-board rail + top and bottom rails. If we want panels back in Phase B, they're reintroduced in the Glyph aesthetic.

## 7. Scope — Phase A vs Phase B

### Phase A (what ships this plan)

- Standalone `/glyph` route mounting the full Glyph UI
- Live data via store-adapter (no mock engine)
- All 10 agents, 6 zones, live intent board, live ticker, live top + bottom rails
- Coin trails, receipts, barriers all wired to real events
- Judy styled in red; attacks animate through the barrier sequence
- Fonts imported + token palette added alongside the legacy palette (no aliasing yet; legacy `/` keeps its look intact)

### Phase B (deferred — separate plan or follow-up tasks)

- Make `/glyph` the default; park legacy pixel city at `/legacy` or retire
- Port AgentPanel, BuildingPanel, TxPanel, ArenaBar to Glyph chrome
- Retire Kenney sprite sheets; remove pixel-art asset loads
- Adapt arena flow for the Glyph UI (the visitor command bar in the new look)
- A11y pass: ensure text-based UI is screen-reader friendly (currently very image-heavy)

## 8. Files map

New files:
- `apps/web/public/fonts/BerkeleyMonoVariable.woff2` + 3 Polymath files *(done — imported)*
- `apps/web/src/glyph/agent-map.ts` — bidirectional agent ↔ glyph mapping + per-agent hex
- `apps/web/src/glyph/zones.ts` — zone definitions (code, name, hex, x/y/w/h, ASCII art)
- `apps/web/src/glyph/store-adapter.ts` — Zustand subscriber that emits engine-shape events
- `apps/web/src/glyph/scene.ts` — ported TS version of `scene.js`, subscribed to adapter
- `apps/web/src/glyph/hud/IntentBoardRail.tsx` — ported from `GCIntentBoard`
- `apps/web/src/glyph/hud/TickerRail.tsx` — ported from `GCTicker`
- `apps/web/src/glyph/hud/TopRail.tsx` — ported from `GCTopRail`
- `apps/web/src/glyph/hud/BottomRail.tsx` — ported from `GCBottomRail`
- `apps/web/src/app/glyph/page.tsx` — Next.js route assembling the shell
- `apps/web/src/app/glyph/page.module.css` — grid shell from `live.css`
- `apps/web/src/app/glyph/glyph-tokens.css` — token import; loaded from page.tsx

Modified files:
- `apps/web/src/app/layout.tsx` — only if we need to declare the font-face blocks globally (we'll import them scoped per-page instead to avoid affecting legacy `/`)

Untouched in Phase A:
- `apps/web/src/phaser/` (legacy pixel scenes)
- `apps/web/src/components/` (legacy panels)
- `apps/web/src/state/city-store.ts` (already has offers + arena state)
- Everything under `packages/orchestrator/`

## 9. Risks / open questions

- **Variable motion volume.** Claude Design's mock engine generates ~1 tx/sec. Our real backend generates ~1 tick every 2-4s (10 agents on 20-40s demo cadence), and most ticks are `post_offer` (cheap, no visual in the Glyph model) or `idle`. The scene may feel quieter than the demo. Mitigation: emit `intent` events from `post_offer` too (they're thread-starters in our model), so the intent-board rail fills even when no tx lands.
- **Judy `010` as `J`.** Claude Design treats Judy as in zone `?` by default. Our live Judy still has a sprite; in Glyph, Judy's glyph just sits in the `?` zone unless/until she attempts a tx, in which case a coin trail + barrier snaps into view. This works.
- **Per-agent hex for our 3-digit ids.** The current roster has `color` fields that don't match Claude Design's per-agent hex. Decision: override roster colors in `agent-map.ts` — render layer uses Glyph hues, data layer keeps whatever the roster says. Legacy `/` continues to use roster colors.
- **`vaultBalance` in top rail.** Claude Design's mock shows a stylized `VAULT $482,311.00`. In live mode we can read the platform treasury's balance via `/snapshot` (or a new `/balances/platform` endpoint). For Phase A, hard-code a placeholder and flag as a follow-up; Phase B can wire real balances.
- **Tick rate for rails.** Claude Design's ticker shows a faux `TX/SEC 14.2`. In our reality it'll be closer to 0.3 tx/sec. We relabel or smooth with an EMA. Decision: show `TX/MIN` instead of `TX/SEC` to match real cadence.

## 10. Success criteria

1. `http://localhost:3000/glyph` renders the full Glyph shell on load (top rail + canvas + intent-board rail + bottom ticker)
2. All 10 agent glyphs visible in their zones; Judy in the `?` zone
3. Within 60s of page open, intent-board rail shows at least 3 real events coming off the live orchestrator (not mock)
4. A successful tx commit produces a green mint `COMMIT · tx NNNN` receipt attached to the destination agent's glyph
5. A rejected tx produces the correct framed dialog stamp (schema teal / overdraft red / unknown amber / idempotency lilac) and a red pulse on the target zone
6. A `post_offer` lands as a gold `◆ OFFER` bubble on the author's glyph and an entry in the intent-board rail's threads list
7. Legacy `/` pixel city continues to work unchanged (regression check)
