# Glyph City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live `/glyph` route that renders the full Glyph City typographic UI (canvas + intent board + rails) driven by our real orchestrator event stream, leaving the legacy pixel city at `/` untouched. Phase B (full default-route swap + remaining panels) is scoped but deferred.

**Architecture:** A new Next.js page assembles a 3-row / 2-col CSS grid shell. The canvas mounts a typescript-ported Phaser scene (`GlyphScene`) whose event API mirrors Claude Design's reference engine. A store-adapter subscribes to `useCityStore`, translates `IntentLogView` / `OfferView` / `CityEvent` into the scene's event vocabulary (`intent` / `commit` / `reject` / `agent-move` / `tick`), and feeds the rails. Zero backend changes.

**Tech Stack:** Existing — Next.js 15, React 19, Phaser 3, Zustand, TypeScript. New assets — Berkeley Mono (variable) + Polymath Display/Text woff2 fonts.

**Scope boundary:** This plan ships Phase A only. Phase B (swap default route, port remaining panels, retire pixel assets) is a separate plan. Spec: `docs/superpowers/specs/2026-04-21-glyph-city-design.md`.

---

## Prerequisites

- Plans 1-5 complete. Arena + intent board live.
- Claude Design zip extracted; assets copied to `apps/web/public/fonts/` and `apps/web/src/glyph/` (already done).
- Backend running against Formance Cloud (`nac-city`) or any other working ledger; demo-cadence ticks firing.

---

## File structure

All new files in Phase A:

```
apps/web/public/fonts/                         (already present — 4 woff2)
apps/web/src/glyph/
  agent-map.ts            ← 3-digit id ↔ letter glyph + hex + home-zone
  zones.ts                ← zone definitions (code, name, hex, rect, ASCII art)
  store-adapter.ts        ← Zustand subscriber → engine-shape events
  scene.ts                ← Phaser scene, ported from Claude Design's scene.js
  hud/
    IntentBoardRail.tsx
    TickerRail.tsx
    TopRail.tsx
    BottomRail.tsx
apps/web/src/app/glyph/
  page.tsx                ← route entry — assembles the shell
  page.module.css         ← CSS grid shell (ported from live.css)
  glyph-tokens.css        ← design tokens (ported from styles.css :root block)
```

Modified files: none in Phase A outside the `glyph/` trees. Fonts are imported via CSS `@font-face` inside `glyph-tokens.css`, scoped to the `/glyph` page only.

---

## Tasks

Each task produces a checkpoint you can observe at `/glyph` in the browser.

---

### Task 1: Token + font import + zone/agent data

**Files:**
- Create: `apps/web/src/app/glyph/glyph-tokens.css`
- Create: `apps/web/src/glyph/agent-map.ts`
- Create: `apps/web/src/glyph/zones.ts`

No runtime yet — this task lays the data scaffolding every subsequent task builds on.

- [ ] **Step 1.1: Create `glyph-tokens.css`**

Copy the `@font-face` blocks and the `:root` palette from `apps/web/src/glyph/styles.css` into a new file `apps/web/src/app/glyph/glyph-tokens.css`. Paths change: `url('./fonts/...')` → `url('/fonts/...')` since we serve from `public/`. Final file (~85 lines):

```css
/* Glyph City design tokens — scoped to the /glyph route. */

@font-face {
  font-family: 'Polymath Display';
  src: url('/fonts/PolymathDisp-Medium.woff2') format('woff2');
  font-weight: 500; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Polymath Display';
  src: url('/fonts/PolymathDisp-Regular.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Polymath Text';
  src: url('/fonts/PolymathText-Regular.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Berkeley Mono';
  src: url('/fonts/BerkeleyMonoVariable.woff2') format('woff2');
  font-weight: 100 900; font-style: normal; font-display: swap;
}

.glyph-root {
  --sky:        #01353C;
  --sky-deep:   #011E22;
  --sky-800:    #012A30;
  --sky-700:    #023740;
  --sky-rule:   #0a4048;

  --ink:        #D5E1E1;
  --ink-soft:   #A6BEC0;
  --ink-dim:    #7A9396;
  --ink-ghost:  #486568;

  --gold:       #D4A24A;
  --gold-soft:  #8B7537;
  --silver:     #A6BEC0;
  --mint:       #BAEABC;
  --mint-dim:   #749B76;
  --scream:     #E5534B;
  --scream-soft:#8B3632;

  --schema:     #60D6CE;
  --unknown-c:  #E8A84A;
  --seen-c:     #B79BD9;

  --a-alice: #D4A24A;
  --a-bob:   #60D6CE;
  --a-carol: #BAEABC;
  --a-dave:  #8CB8D6;
  --a-eve:   #B79BD9;
  --a-frank: #E8A84A;
  --a-grace: #F5B8C8;
  --a-heidi: #7FD6A8;
  --a-ivan:  #C9B892;
  --a-judy:  #E5534B;

  --font-display: 'Polymath Display', ui-serif, Georgia, serif;
  --font-text:    'Polymath Text', ui-sans-serif, system-ui, sans-serif;
  --font-mono:    'Berkeley Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

  --cell: 12px;
  background: var(--sky-deep);
  color: var(--ink);
  font-family: var(--font-mono);
}
```

Scoped to `.glyph-root` so it doesn't bleed into `/`.

- [ ] **Step 1.2: Create `agent-map.ts`**

```typescript
// apps/web/src/glyph/agent-map.ts
// Bidirectional mapping between our 3-digit agent ids and the Glyph City
// single-letter glyphs + per-agent hue. Render boundary only — the wire
// protocol still uses the 3-digit ids.

export interface GlyphAgent {
  id: string;          // "001" … "010"
  letter: string;      // "A" … "J"
  glyph: string;       // "Ⓐ" … "Ⓙ"
  name: string;
  role: string;
  hex: string;
  home: ZoneCode;
  red?: boolean;
}

export type ZoneCode = "MKT" | "BNK" | "POS" | "INS" | "POL" | "ESC" | "?";

export const GLYPH_AGENTS: GlyphAgent[] = [
  { id: "001", letter: "A", glyph: "Ⓐ", name: "Alice", role: "Market-maker",  hex: "#D4A24A", home: "MKT" },
  { id: "002", letter: "B", glyph: "Ⓑ", name: "Bob",   role: "Courier",       hex: "#60D6CE", home: "POS" },
  { id: "003", letter: "C", glyph: "Ⓒ", name: "Carol", role: "Inspector",     hex: "#BAEABC", home: "INS" },
  { id: "004", letter: "D", glyph: "Ⓓ", name: "Dave",  role: "Lender",        hex: "#8CB8D6", home: "BNK" },
  { id: "005", letter: "E", glyph: "Ⓔ", name: "Eve",   role: "Researcher",    hex: "#B79BD9", home: "INS" },
  { id: "006", letter: "F", glyph: "Ⓕ", name: "Frank", role: "Writer",        hex: "#E8A84A", home: "MKT" },
  { id: "007", letter: "G", glyph: "Ⓖ", name: "Grace", role: "Illustrator",   hex: "#F5B8C8", home: "ESC" },
  { id: "008", letter: "H", glyph: "Ⓗ", name: "Heidi", role: "Pool-keeper",   hex: "#7FD6A8", home: "POL" },
  { id: "009", letter: "I", glyph: "Ⓘ", name: "Ivan",  role: "Disputant",     hex: "#C9B892", home: "ESC" },
  { id: "010", letter: "J", glyph: "Ⓙ", name: "Judy",  role: "Red agent",     hex: "#E5534B", home: "?", red: true }
];

const BY_ID     = new Map(GLYPH_AGENTS.map((a) => [a.id, a]));
const BY_LETTER = new Map(GLYPH_AGENTS.map((a) => [a.letter, a]));

export function glyphAgentById(id: string): GlyphAgent | undefined {
  return BY_ID.get(id);
}
export function glyphAgentByLetter(letter: string): GlyphAgent | undefined {
  return BY_LETTER.get(letter);
}
export function glyphOf(id: string): string {
  return BY_ID.get(id)?.glyph ?? "?";
}
export function hexOf(id: string): string {
  return BY_ID.get(id)?.hex ?? "#D5E1E1";
}
```

- [ ] **Step 1.3: Create `zones.ts`**

Ported from `data.js`, with ASCII art preserved verbatim. One zone definition:

```typescript
// apps/web/src/glyph/zones.ts
import type { ZoneCode } from "./agent-map";

export interface GlyphZone {
  code: ZoneCode;
  name: string;
  hex: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ascii: string;         // multi-line ASCII block, ≤6 rows
  ownerAgentId?: string; // 3-digit id (null for "?" / Judy's zone)
}

export const GLYPH_ZONES: Record<ZoneCode, GlyphZone> = {
  MKT: {
    code: "MKT", name: "MARKET",      hex: "#D4A24A", x: 60,  y: 70,  w: 230, h: 150,
    ownerAgentId: "001",
    ascii: `╔═══════════╗
║ $ │ $ │ $ ║
╠═══╪═══╪═══╣
║ ¢ │ ¢ │ ¢ ║
╚═══╧═══╧═══╝`
  },
  BNK: {
    code: "BNK", name: "BANK · VAULT", hex: "#8CB8D6", x: 300, y: 70,  w: 230, h: 150,
    ownerAgentId: "004",
    ascii: `   ┌─────┐
  ┌┴─────┴┐
  │ B·A·N·K│
  ├─┬─┬─┬─┤
  │▓│▓│▓│▓│
  └─┴─┴─┴─┘`
  },
  POS: {
    code: "POS", name: "POST OFFICE",  hex: "#60D6CE", x: 540, y: 70,  w: 230, h: 150,
    ownerAgentId: "002",
    ascii: `┌──────────┐
│ ▢ ▢ ▢ ▢ │
│  ↘  POST │
│   ╲      │
└──┬───┬───┘
   │ ✉ │    `
  },
  INS: {
    code: "INS", name: "INSPECTOR",    hex: "#BAEABC", x: 60,  y: 230, w: 230, h: 170,
    ownerAgentId: "003",
    ascii: `  ┌─────┐
  │ ?   │
  │  ✓  │
  │   ✗ │
 ─┴─────┴─
 │       │`
  },
  POL: {
    code: "POL", name: "POOL",         hex: "#7FD6A8", x: 300, y: 230, w: 230, h: 170,
    ownerAgentId: "008",
    ascii: `  ╭──────╮
  │ ~~~~~│
  │ ≈≈≈≈≈│
  │ ~~~~~│
  ╰──────╯`
  },
  ESC: {
    code: "ESC", name: "ESCROW",       hex: "#B79BD9", x: 540, y: 230, w: 230, h: 170,
    ownerAgentId: "009",
    ascii: `  ┌─────┐
  │ ▒▒▒ │
  │ ▒§▒ │
  │ ▒▒▒ │
  └──┬──┘
     │   `
  },
  "?": {
    code: "?", name: "UNKNOWN",        hex: "#E5534B", x: 790, y: 150, w: 160, h: 240,
    ascii: `╲╲╲╲╲╲╲╲
╲╲╲╲╲╲╲╲
  ???   
╲╲╲╲╲╲╲╲
╲╲╲╲╲╲╲╲`
  }
};

export const CANVAS_W = 980;
export const CANVAS_H = 430;
```

- [ ] **Step 1.4: Verify types**

```bash
cd /Users/finnmabie/Documents/numscript-agent-city && pnpm --filter @nac/web lint 2>&1 | tail -3
```

Must exit 0. No runtime to test yet — just module compilation.

- [ ] **Step 1.5: Commit**

```bash
git add apps/web/src/app/glyph/glyph-tokens.css apps/web/src/glyph/agent-map.ts apps/web/src/glyph/zones.ts
git commit -m "feat(glyph): tokens + agent-glyph mapping + zone definitions"
```

---

### Task 2: Store adapter — real events → glyph engine shape

**Files:**
- Create: `apps/web/src/glyph/store-adapter.ts`

The adapter is a Zustand subscriber that emits events in the shape Claude Design's `scene.js` expects. Five event kinds: `intent`, `commit`, `reject`, `agent-move`, `tick`.

- [ ] **Step 2.1: Implement `store-adapter.ts`**

```typescript
// apps/web/src/glyph/store-adapter.ts
import { useCityStore } from "../state/city-store";
import type { OfferView } from "../state/city-store";
import { barrierKindFor } from "../phaser/barrier";
import { GLYPH_AGENTS } from "./agent-map";

export type GlyphBarrierKind = "schema" | "overdraft" | "unknown" | "seen";

export interface GlyphIntentEvent {
  id: string;
  from: string;           // 3-digit id
  to: string;             // 3-digit id OR zone code
  kind: "offer" | "reply";
  amount: number;
  summary: string;
  parent?: string;
  judy?: boolean;
}
export interface GlyphCommitEvent {
  id: string; from: string; to: string; amount: number; txid: string;
}
export interface GlyphRejectEvent {
  id: string; from: string; to: string; amount: number; txid: string;
  barrier: GlyphBarrierKind;
  detail: Record<string, string | number>;
}
export interface GlyphMoveEvent {
  id: string; fromZone: string; toZone: string; durationMs: number;
}
export interface GlyphTickEvent { tick: number; commits: number; rejects: number; }

type Listener<T> = (payload: T) => void;

export interface GlyphAdapter {
  on(ev: "intent", fn: Listener<GlyphIntentEvent>): void;
  on(ev: "commit", fn: Listener<GlyphCommitEvent>): void;
  on(ev: "reject", fn: Listener<GlyphRejectEvent>): void;
  on(ev: "agent-move", fn: Listener<GlyphMoveEvent>): void;
  on(ev: "tick", fn: Listener<GlyphTickEvent>): void;
  off(ev: string, fn: Listener<unknown>): void;
  /** Scene calls this every 500ms; we ignore (real ticks drive events). */
  tick(): void;
  /** Call on unmount — removes the Zustand subscription. */
  destroy(): void;
}

export function createGlyphAdapter(): GlyphAdapter {
  const listeners: Record<string, Set<Listener<unknown>>> = {};
  const emit = <T,>(ev: string, p: T) =>
    listeners[ev]?.forEach((fn) => (fn as Listener<T>)(p));

  // Track which recent entries and offers we've already emitted for,
  // so resubscribe callbacks don't re-fire old events.
  const emittedTickIds = new Set<string>();
  const emittedOfferIds = new Set<string>();

  function amountFromParams(params: unknown): number {
    if (!params || typeof params !== "object") return 0;
    const p = params as any;
    const amt = p.amount;
    if (amt && typeof amt === "object" && "amount" in amt) {
      return Number(amt.amount) / 100;    // cents → dollars for display
    }
    if (typeof amt === "number") return amt / 100;
    return 0;
  }

  function counterpartyFromParams(params: unknown): string | undefined {
    if (!params || typeof params !== "object") return undefined;
    for (const v of Object.values(params as Record<string, unknown>)) {
      if (typeof v === "string") {
        const m = v.match(/^@agents:([0-9]{3}):.+$/);
        if (m && m[1]) return m[1];
      }
    }
    return undefined;
  }

  const unsub = useCityStore.subscribe((s, prev) => {
    // New recent entries → commit/reject/intent
    for (const r of s.recent) {
      if (emittedTickIds.has(r.tickId)) continue;
      const prior = prev?.recent.find((p) => p.tickId === r.tickId);
      // Emit only when the outcome actually changed state
      if (prior?.outcome === r.outcome && prior?.templateId === r.templateId) continue;

      const judy = r.agentId === "010";
      const amount = amountFromParams(r.params);
      const peer = counterpartyFromParams(r.params) ?? r.agentId;
      const txid = r.txId ?? r.tickId.split(":")[1] ?? "0";

      if (r.outcome === "committed") {
        emittedTickIds.add(r.tickId);
        emit<GlyphCommitEvent>("commit", {
          id: r.tickId, from: r.agentId, to: peer, amount, txid
        });
      } else if (r.outcome === "rejected") {
        emittedTickIds.add(r.tickId);
        const barrier = mapBarrier(r.errorPhase, r.errorCode);
        emit<GlyphRejectEvent>("reject", {
          id: r.tickId, from: r.agentId, to: peer, amount, txid,
          barrier,
          detail: detailFor(barrier, r.errorCode ?? "", r.errorPhase ?? "", amount)
        });
      }
      // Note: we intentionally don't emit 'intent' for pending/idle outcomes
      // here — offers get their own path below.
    }

    // New offers → intent events (gold for root, silver for reply)
    for (const o of Object.values(s.offers)) {
      if (emittedOfferIds.has(o.id)) continue;
      emittedOfferIds.add(o.id);
      emit<GlyphIntentEvent>("intent", {
        id: o.id,
        from: o.authorAgentId,
        to: o.inReplyTo ?? o.authorAgentId,
        kind: o.inReplyTo ? "reply" : "offer",
        amount: 0,
        summary: o.text.length > 60 ? o.text.slice(0, 57).trimEnd() + "…" : o.text,
        parent: o.inReplyTo ?? undefined,
        judy: o.authorAgentId === "010"
      });
    }

    // Aggregate tick
    emit<GlyphTickEvent>("tick", {
      tick: s.ticksToday,
      commits: s.committedToday,
      rejects: s.rejectedToday
    });
  });

  return {
    on: (ev: string, fn: Listener<unknown>) => {
      (listeners[ev] ||= new Set()).add(fn);
    },
    off: (ev: string, fn: Listener<unknown>) => {
      listeners[ev]?.delete(fn);
    },
    tick: () => { /* no-op in live mode */ },
    destroy: () => { unsub(); }
  };
}

function mapBarrier(phase: string | null, code: string | null): GlyphBarrierKind {
  const k = barrierKindFor(phase, code);
  switch (k) {
    case "schema":           return "schema";
    case "overdraft":        return "overdraft";
    case "unknown-template": return "unknown";
    case "idempotency":      return "seen";
    case "authorization":    return "overdraft";  // closest visual; authorization = cage caught impersonation
    default:                 return "overdraft";
  }
}

function detailFor(barrier: GlyphBarrierKind, code: string, phase: string, amount: number): Record<string, string | number> {
  switch (barrier) {
    case "schema":
      return { field: "amount", want: "uint64", got: code || phase || "invalid" };
    case "overdraft":
      return { debit: `${amount.toFixed(2)}`, avail: "0.00", short: `${amount.toFixed(2)}` };
    case "unknown":
      return { tmpl: code || "unknown_template", known: "posting, hold", hint: "register it" };
    case "seen":
      return { nonce: code || "replay", first: "prior tick", effect: "no-op" };
  }
}
```

- [ ] **Step 2.2: Verify types**

```bash
pnpm --filter @nac/web lint 2>&1 | tail -3
```

Must exit 0.

- [ ] **Step 2.3: Commit**

```bash
git add apps/web/src/glyph/store-adapter.ts
git commit -m "feat(glyph): store-adapter maps live events to scene vocabulary"
```

---

### Task 3: Port the Phaser scene to TypeScript

**Files:**
- Create: `apps/web/src/glyph/scene.ts`

Port `scene.js` to TypeScript with the adapter wired instead of the mock engine.

- [ ] **Step 3.1: Implement `scene.ts`**

This is a large file — ~300 lines of Phaser scene. Approach: copy the body of `scene.js` verbatim, add types, replace `NCData.AGENTS` and `NCData.A` with imports from `agent-map.ts`, replace `ZONES` literal with imports from `zones.ts`, and replace the `engine` parameter signature with `GlyphAdapter`.

Key diffs from the JS original:

- File header:

```typescript
import Phaser from "phaser";
import { GLYPH_AGENTS, glyphAgentById, type GlyphAgent } from "./agent-map";
import { GLYPH_ZONES, CANVAS_W, CANVAS_H, type GlyphZone } from "./zones";
import type {
  GlyphAdapter,
  GlyphIntentEvent,
  GlyphCommitEvent,
  GlyphRejectEvent,
  GlyphMoveEvent
} from "./store-adapter";
```

- Class shape:

```typescript
export class GlyphScene extends Phaser.Scene {
  private agentSprites = new Map<string, {
    txt: Phaser.GameObjects.Text;
    lbl: Phaser.GameObjects.Text;
    agent: GlyphAgent;
    home: { x: number; y: number };
    zone: string;
    wobblePhase: number;
    tweenActive?: boolean;
  }>();
  private receipts: Array<{ container: Phaser.GameObjects.Container; bornAt: number; duration: number }> = [];
  private barriers: Array<{ container: Phaser.GameObjects.Container; bornAt: number; duration: number }> = [];
  private coinTrails: Array<{ elems: Phaser.GameObjects.GameObject[]; bornAt: number; duration: number }> = [];

  constructor(private adapter: GlyphAdapter) {
    super({ key: "GlyphScene" });
  }

  create(): void { /* port from scene.js, using GLYPH_ZONES + GLYPH_AGENTS */ }
  update(_t: number, _dt: number): void { /* port wobble + expire logic */ }

  private zoneCenter(code: string): { x: number; y: number } { /* port */ }
  private agentPos(id: string): { x: number; y: number } { /* port */ }

  private onIntent(p: GlyphIntentEvent): void { /* port */ }
  private onCommit(p: GlyphCommitEvent): void { /* port */ }
  private onReject(p: GlyphRejectEvent): void { /* port */ }
  private onAgentMove(p: GlyphMoveEvent): void { /* port */ }

  private fireCoinTrail(from: { x: number; y: number }, to: { x: number; y: number }, color: string): void { /* port */ }
}
```

Inside `create()`, instead of `engine.on(...)`, wire to the adapter:

```typescript
    this.adapter.on("intent",     (p) => this.onIntent(p));
    this.adapter.on("commit",     (p) => this.onCommit(p));
    this.adapter.on("reject",     (p) => this.onReject(p));
    this.adapter.on("agent-move", (p) => this.onAgentMove(p));
```

And DROP the `engine.tick()` timer — our adapter emits on real Zustand changes.

Inside `onIntent`, the `from` and `to` are 3-digit ids; resolve glyphs via `glyphAgentById(from)?.glyph ?? from`. Same for colors via `.hex`.

Inside `onCommit`, the receipt uses the per-agent glyphs/hues:

```typescript
    const fromGlyph = glyphAgentById(p.from)?.glyph ?? p.from;
    const toGlyph   = glyphAgentById(p.to)?.glyph   ?? p.to;
    // ...
    const l2 = this.add.text(10, 34, `${fromGlyph} → ${toGlyph}`, { ... });
```

Inside `onReject`, the target may be a zone code OR an agent id. Resolve it:

```typescript
    const targetPos = GLYPH_ZONES[p.to as keyof typeof GLYPH_ZONES]
      ? this.zoneCenter(p.to)
      : this.agentPos(p.to);
```

- [ ] **Step 3.2: Verify types**

```bash
pnpm --filter @nac/web lint 2>&1 | tail -3
```

Must exit 0.

- [ ] **Step 3.3: Commit**

```bash
git add apps/web/src/glyph/scene.ts
git commit -m "feat(glyph): port Phaser scene to TypeScript; wired to live adapter"
```

---

### Task 4: React HUD rails (TSX ports)

**Files:**
- Create: `apps/web/src/glyph/hud/IntentBoardRail.tsx`
- Create: `apps/web/src/glyph/hud/TickerRail.tsx`
- Create: `apps/web/src/glyph/hud/TopRail.tsx`
- Create: `apps/web/src/glyph/hud/BottomRail.tsx`

Port each `GC*` component from `hud.jsx` to strict TypeScript React. They share one interface: each accepts `{ adapter: GlyphAdapter }` and subscribes to the appropriate event streams in a `useEffect`.

- [ ] **Step 4.1: Port `IntentBoardRail.tsx`**

Full port of `GCIntentBoard`. Replace `NCData.A[id]?.glyph` with `glyphOf(id)` from `../agent-map`. State shape (`threads`, `flatLog`) stays identical. One notable change: `const barrierSig = { schema:'⬡', overdraft:'⊘', unknown:'404', seen:'⟳' };` stays as-is (matches our `GlyphBarrierKind` union).

Template:

```tsx
"use client";
import { useEffect, useState } from "react";
import type {
  GlyphAdapter, GlyphIntentEvent, GlyphCommitEvent, GlyphRejectEvent
} from "../store-adapter";
import { glyphOf, hexOf } from "../agent-map";

interface Thread {
  id: string;
  from: string; to: string;
  amount: number; summary: string;
  replies: Array<{ from: string; summary: string }>;
  state: "open" | "committed" | "rejected";
  judy?: boolean;
  txid?: string;
  barrier?: "schema" | "overdraft" | "unknown" | "seen";
}

interface LogRow {
  kind: "commit" | "reject";
  from: string; to: string;
  amount: number; txid: string;
  barrier?: "schema" | "overdraft" | "unknown" | "seen";
}

const BARRIER_SIG: Record<string, string> = { schema: "⬡", overdraft: "⊘", unknown: "404", seen: "⟳" };
const BARRIER_HEX: Record<string, string> = { schema: "#60D6CE", overdraft: "#E5534B", unknown: "#E8A84A", seen: "#B79BD9" };

export default function IntentBoardRail({ adapter }: { adapter: GlyphAdapter }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [flatLog, setFlatLog] = useState<LogRow[]>([]);

  useEffect(() => {
    const onIntent = (p: GlyphIntentEvent) => { /* same as GCIntentBoard */ };
    const onCommit = (p: GlyphCommitEvent) => { /* same */ };
    const onReject = (p: GlyphRejectEvent) => { /* same */ };
    adapter.on("intent", onIntent);
    adapter.on("commit", onCommit);
    adapter.on("reject", onReject);
    return () => {
      adapter.off("intent", onIntent as any);
      adapter.off("commit", onCommit as any);
      adapter.off("reject", onReject as any);
    };
  }, [adapter]);

  return (
    <div className="ib">
      { /* JSX body ported from GCIntentBoard */ }
    </div>
  );
}
```

Paste the JSX body straight over, swapping `NCData.A[id]?.glyph || id` → `glyphOf(id)` and `NCData.A[id]?.hex || '#D5E1E1'` → `hexOf(id)`.

- [ ] **Step 4.2: Port `TickerRail.tsx`, `TopRail.tsx`, `BottomRail.tsx`**

Identical pattern for each. Ports of `GCTicker`, `GCTopRail`, `GCBottomRail` from `hud.jsx`. One live-mode change in `BottomRail`:

```tsx
// old:  TX/SEC {(Math.random()*3+12).toFixed(1)}
// new:  TX/MIN {(commits + rejects > 0 ? ((commits + rejects) / Math.max(1, tick) * 60).toFixed(1) : "0.0")}
```

Compute TX/MIN from the cumulative tick counter — approximate but truthful, not a mock.

- [ ] **Step 4.3: Verify types**

```bash
pnpm --filter @nac/web lint 2>&1 | tail -3
```

Must exit 0. No runtime test yet — the page that mounts these is Task 5.

- [ ] **Step 4.4: Commit**

```bash
git add apps/web/src/glyph/hud/
git commit -m "feat(glyph): React HUD rails — IntentBoard, Ticker, Top, Bottom"
```

---

### Task 5: Route page + grid shell

**Files:**
- Create: `apps/web/src/app/glyph/page.tsx`
- Create: `apps/web/src/app/glyph/page.module.css`

The Next.js route that mounts everything together.

- [ ] **Step 5.1: Create `page.module.css`**

Port from `live.css` — 3-row / 2-col grid, dotted background, hairline rules. ~90 lines. Root selector changes from `body.live` to `.shell` for scoping.

Full content:

```css
/* Glyph City — live grid shell. */

.shell {
  display: grid;
  grid-template-rows: 28px 1fr 72px;
  grid-template-columns: 1fr 320px;
  grid-template-areas:
    "top  top"
    "cvs  ib"
    "tk   tk";
  width: 100vw; height: 100vh;
  gap: 0;
  background: var(--sky-deep);
  background-image: radial-gradient(circle, rgba(213,225,225,0.05) 1px, transparent 1.25px);
  background-size: 12px 12px;
  color: var(--ink);
  font-family: var(--font-mono);
}

.tr { grid-area: top;
  display: flex; align-items: center; gap: 26px;
  padding: 0 18px;
  font-size: 10px; letter-spacing: 1.6px; color: var(--ink-dim);
  border-bottom: 1px solid var(--sky-rule);
  text-transform: uppercase;
}
.tr-brand { color: var(--ink); }
.tr-red   { color: var(--scream); }
.tr-mint  { color: var(--mint); }
.tr-dim   { color: var(--ink-dim); }
.tr-spacer { flex: 1; }

.canvas-wrap {
  grid-area: cvs;
  position: relative;
  border-right: 1px solid var(--sky-rule);
  overflow: hidden;
  min-height: 0;
}
.canvas-wrap > canvas { display: block; }

.ib { grid-area: ib;
  padding: 14px 16px 16px;
  overflow: hidden;
  display: flex; flex-direction: column; gap: 10px;
  font-size: 11px;
}
.ib-head, .ib-log-head {
  font-size: 10px; letter-spacing: 1.6px; color: var(--ink-dim); text-transform: uppercase;
  padding-bottom: 6px; border-bottom: 1px solid var(--sky-rule);
}
.ib-threads, .ib-log { display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.ib-thread { display: flex; flex-direction: column; gap: 4px; }
.ib-root { display: grid; grid-template-columns: auto auto auto; gap: 0 10px; align-items: baseline; }
.ib-tag { font-size: 9px; letter-spacing: 1.4px; text-transform: uppercase; }
.ib-who { font-size: 12px; }
.ib-amt { color: var(--ink); margin-left: auto; }
.ib-sum { grid-column: 1 / -1; color: var(--ink-soft); font-size: 11px; }
.ib-state { grid-column: 1 / -1; font-size: 9px; letter-spacing: 1.2px; }
.ib-reply { padding-left: 18px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.ib-connector { width: 8px; height: 1px; background: var(--sky-rule); display: inline-block; }
.ib-log-row { display: flex; gap: 10px; font-size: 10px; color: var(--ink-soft); }

.tk { grid-area: tk;
  border-top: 1px solid var(--sky-rule);
  display: flex; align-items: center; gap: 18px;
  padding: 0 18px;
  overflow: hidden;
  font-size: 11px;
}
.tk-lbl { color: var(--ink-dim); letter-spacing: 1.6px; font-size: 10px; text-transform: uppercase; }
.tk-rows { display: flex; gap: 22px; overflow: hidden; white-space: nowrap; }
.tk-row { display: flex; gap: 6px; align-items: baseline; }
.tk-tx { color: var(--ink-dim); font-size: 10px; }
.tk-who { color: var(--ink-soft); }
.tk-amt { font-size: 11px; }

.br { /* bottom rail within .tk if we merge them; otherwise a dedicated section */
  color: var(--ink-dim); letter-spacing: 1.2px; font-size: 9px; text-transform: uppercase;
  margin-left: auto; display: flex; gap: 18px; align-items: center;
}
.br-spacer { flex: 1; }
```

- [ ] **Step 5.2: Create `page.tsx`**

```tsx
"use client";
import "./glyph-tokens.css";
import styles from "./page.module.css";
import { useEffect, useMemo, useRef } from "react";
import Phaser from "phaser";
import { createGlyphAdapter } from "../../glyph/store-adapter";
import { GlyphScene } from "../../glyph/scene";
import { CANVAS_W, CANVAS_H } from "../../glyph/zones";
import IntentBoardRail from "../../glyph/hud/IntentBoardRail";
import TickerRail from "../../glyph/hud/TickerRail";
import TopRail from "../../glyph/hud/TopRail";
import BottomRail from "../../glyph/hud/BottomRail";
import { useCityStore } from "../../state/city-store";

const ORCH_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? process.env.NEXT_PUBLIC_ORCH_HTTP ?? "http://127.0.0.1:3071";
const WS_URL = process.env.NEXT_PUBLIC_CITY_WS ?? "ws://127.0.0.1:3070";

export default function GlyphPage() {
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const adapter = useMemo(() => createGlyphAdapter(), []);

  // Hydrate the store once on mount (same pattern as CityStage).
  useEffect(() => {
    fetch(`${ORCH_BASE}/snapshot`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => useCityStore.getState().hydrate({ agents: b.agents ?? [], recent: b.recent ?? [] }))
      .catch(() => { /* non-fatal */ });
    fetch(`${ORCH_BASE}/offers`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => useCityStore.getState().hydrateOffers(b.offers ?? []))
      .catch(() => { /* non-fatal */ });

    const ws = new WebSocket(WS_URL);
    ws.onmessage = (ev) => {
      try { useCityStore.getState().applyEvent(JSON.parse(ev.data)); } catch { /* ignore */ }
    };
    return () => { ws.close(); };
  }, []);

  // Mount Phaser once the wrap element exists.
  useEffect(() => {
    if (!canvasWrapRef.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: canvasWrapRef.current,
      width: CANVAS_W, height: CANVAS_H,
      transparent: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: [new GlyphScene(adapter)]
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
      adapter.destroy();
    };
  }, [adapter]);

  return (
    <div className={`glyph-root ${styles.shell}`}>
      <TopRail adapter={adapter} />
      <div ref={canvasWrapRef} className={styles["canvas-wrap"]} />
      <IntentBoardRail adapter={adapter} />
      <TickerRail adapter={adapter} />
      <BottomRail adapter={adapter} />
    </div>
  );
}
```

- [ ] **Step 5.3: Dev-server smoke**

```bash
pnpm --filter @nac/web lint 2>&1 | tail -3
```

Expect: 0 errors.

Then open `http://localhost:3000/glyph` in the browser (dev server already running via `pnpm web:dev`). Verify the success criteria from spec §10:

1. Full Glyph shell renders on load
2. All 10 agent glyphs visible; Judy in `?` zone
3. Within 60s, intent-board rail shows at least 3 real events
4. Committed tx → mint `COMMIT · tx N` receipt
5. Rejected tx → correct barrier dialog
6. `post_offer` → gold `◆ OFFER` bubble + board entry
7. Legacy `/` still works (regression check)

If any fail, file a follow-up task. Don't block.

- [ ] **Step 5.4: Commit**

```bash
git add apps/web/src/app/glyph/
git commit -m "feat(glyph): live /glyph route with canvas + rails + real events"
```

---

## Release gate — Phase A complete when

- `pnpm --filter @nac/web lint` clean
- `http://localhost:3000/glyph` renders the shell with 10 glyphs in their zones, no console errors
- Within 60s of page open, at least one real commit / reject / offer has animated through the scene + appeared in the intent-board rail
- Legacy `/` pixel city still works

---

## Self-review

**Spec coverage:**
- §3 aesthetic principles → covered by Task 1 tokens + Task 5 grid
- §4 agent + building model → Task 1 (data) + Task 3 (rendering)
- §5 live data binding → Task 2 adapter
- §6 UI shell → Task 5
- §7 Phase A scope → all tasks; Phase B explicitly deferred

**Placeholder audit:** Task 3 and Task 4 use "/* port */" comments for verbatim JS-to-TS conversions. Acceptable because the source is explicitly cited (`scene.js`, `hud.jsx`) and the implementer is expected to copy the body then fix types. Everywhere runtime behaviour changes (adapter wiring, hydrate, glyph resolution) has full code shown.

**Type consistency:** `GlyphAdapter` / `GlyphIntentEvent` / `GlyphBarrierKind` used consistently across Tasks 2, 3, 4. Agent ids are always 3-digit strings on the wire; letter/glyph resolution happens only in `agent-map.ts` + rendering.
