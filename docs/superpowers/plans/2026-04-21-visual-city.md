# Visual City — Pixel village front-end with HUD, coin flows, barrier animations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Next.js front-end that renders the Plan-2 agent economy as a pixel village. Ten agent sprites in a tile-based town; coin-flow particles animate every transaction; floating `+$X.XX` popups on success, red `✗ REJECTED` flashes on rejection (four distinct barrier styles for the four rejection phases). HUD shows live counters. Click any agent → profile panel with intent log. Click any transaction popup → Numscript + postings panel.

**Architecture:** Next.js 15 App Router app at `apps/web/`. A single `/` page mounts a Phaser 3 canvas. The page boots by fetching an HTTP `/snapshot` from the orchestrator for initial state, then opens a WebSocket to the event bus and applies deltas. Phaser owns the canvas + particle effects; React owns the HUD chrome (counters, popovers, panels) positioned over the canvas.

**Tech Stack:** Next.js 15 / React 19 / Phaser 3 / Tailwind / Kenney CC0 sprite packs / native WebSocket. Orchestrator gains a small HTTP server (alongside the existing WS) and an optional `DEMO_MODE` env flag for faster ticks during visualization testing.

**Scope boundary:** No arena input, no webm capture, no OG share images, no mobile layout, no auth. Those are Plan 4 or deferred. This plan stops at *"I open http://localhost:3000 while `pnpm city:start` is running and watch the village live."*

---

## Prerequisites

- Plans 1 and 2 complete. `pnpm city:start` works and emits events on `ws://127.0.0.1:3070`.
- `ANTHROPIC_API_KEY` set (for the backend; the front end never sees it).

---

## Design direction (applies to all chrome tasks — 3, 13, 14, 15, 16)

The Phaser canvas is a pixel village (Kenney sprites, zoom 3, crisp pixel art). The **chrome around it** — HUD bar, hover card, panels, overlays — commits to a distinct, cohesive aesthetic. Default Tailwind + Inter is forbidden: it produces the generic "AI dashboard" look we already decided against.

### Aesthetic: Financial data-room meets arcade cabinet

- **Everything chrome-level is monospace.** Harmonizes with pixel-art's grid discipline. Nothing sans-serif.
- **One scream color — vermillion `#ec3a2d` — reserved for rejections and attention moments.** Never used decoratively. The rejected-attempts counter pulses in it on every increment. The barrier shields use it. Nothing else.
- **Warm neutrals, not pure black/white.** `#0a0908` background, `#ede8df` text. A paper-and-ink quality, not a "dark-mode website."
- **Generous negative space + tight 1px rules.** No cards, no shadows, no gradients. Rules where separation is needed, nothing otherwise.
- **Tabular numerals everywhere.** Balances, counters, timestamps — all `font-variant-numeric: tabular-nums` so digits don't dance when values change.
- **Panels slide in with a deliberate curve.** `cubic-bezier(0.2, 0.9, 0.3, 1)` — confident, slight overshoot. Not ease-in-out.

### Design tokens (CSS custom properties, set globally in Task 3)

```css
:root {
  --ink: #0a0908;          /* background */
  --paper: #ede8df;        /* primary text */
  --dim: #6e6a62;          /* secondary text */
  --mute: #3a3732;          /* rules, subtle borders */
  --gold: #f0c457;          /* coin trails, committed-outcome accents */
  --scream: #ec3a2d;        /* THE rejection color. Use sparingly. */
  --hustle: #d98b2b;        /* hustle-mode indicator (distinct from gold/scream) */
  --panel-ease: cubic-bezier(0.2, 0.9, 0.3, 1);
}
```

### Typography

Load via `next/font/google` in `src/app/layout.tsx` (Task 3):

```ts
import { JetBrains_Mono } from "next/font/google";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono"
});
```

Apply `mono.variable` to `<body>` and set `font-family: var(--font-mono), ui-monospace, monospace;` in `globals.css`. No sans-serif anywhere in the chrome.

### Motion specs (applies to Tasks 14, 15, 16)

- **Panels** (AgentPanel, TxPanel): 240ms slide-in from the respective edge, using `--panel-ease`. Slide-out 180ms with `cubic-bezier(0.4, 0, 1, 0.6)`.
- **Counter increments** (HudTopBar): when `ticksToday`, `rejectedToday`, etc. increase, do a 200ms scale from 1.00 → 1.08 → 1.00 with a brief color pulse. Rejection counter pulses in `--scream`; others in `--paper`.
- **Hover card** (AgentCard): fade + 4px translate-up on enter (120ms); instant on leave.

### What the finished chrome should feel like

Reference: think less "shadcn dashboard" and more "a terminal that an auditor designed." Every pixel has a reason; when the rejection counter pulses red, it's the only color on the screen for 200ms and it matters. The pixel-village canvas sits inside this chrome like a photo in a matte: the chrome frames the content without competing for attention.

### What to avoid

- Inter, Roboto, system-ui, Arial — any default sans-serif
- Tailwind's default `bg-gray-900`, `text-gray-400`, etc. — always through the custom tokens
- Any gradient (noise-textures, radial-gradients, card shadows)
- Rounded-corner pills, card shadows, "glassmorphism"
- Blue `#3b82f6` as an accent — it's the AI-slop default
- Lucide icons and emoji for ornament (functional indicators like ✓/✗/♦ are fine — they ARE the semantics)

---

## File structure (created by end of plan)

```
apps/
└── web/
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── tailwind.config.ts
    ├── postcss.config.mjs
    ├── public/
    │   └── assets/
    │       ├── tiny-town/              # Kenney Tiny Town tileset (CC0)
    │       │   ├── tilemap.png
    │       │   └── tilemap.json         # tile index
    │       ├── characters/              # colored character sprites
    │       │   └── tiny-characters.png
    │       └── ui/
    │           └── barrier-schema.svg
    │           └── barrier-overdraft.svg
    │           └── barrier-unknown.svg
    │           └── barrier-authorization.svg
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx               # root layout + Tailwind import
    │   │   ├── page.tsx                 # mounts <CityStage/>
    │   │   └── globals.css
    │   ├── lib/
    │   │   ├── event-schema.ts          # discriminated CityEvent union for the UI
    │   │   ├── snapshot.ts              # fetch `/snapshot` once on boot
    │   │   ├── event-stream.ts          # WebSocket client with reconnect
    │   │   └── format.ts                # $ formatting, id→name lookup
    │   ├── state/
    │   │   └── city-store.ts            # Zustand store: agents, balances, recent events
    │   ├── phaser/
    │   │   ├── boot.ts                  # configure + launch Phaser game
    │   │   ├── scenes/
    │   │   │   └── CityScene.ts         # tile map + agents + particles + animations
    │   │   ├── agent-sprite.ts          # single agent render + movement
    │   │   ├── coin-flow.ts             # particle emitter for tx flows
    │   │   ├── amount-popup.ts          # floating text popup
    │   │   └── barrier.ts               # rejection-kind → animated barrier
    │   └── components/
    │       ├── CityStage.tsx            # wraps the Phaser canvas + HUD layout
    │       ├── HudTopBar.tsx            # counters
    │       ├── HudHint.tsx              # "press / to ..." hint (dormant until Plan 4)
    │       ├── AgentCard.tsx            # hover card over a sprite
    │       ├── AgentPanel.tsx           # slide-in profile + intent log
    │       └── TxPanel.tsx              # slide-in tx detail
    └── README.md

packages/orchestrator/
├── src/
│   ├── http.ts                          # NEW: small HTTP server for /snapshot
│   └── run-city.ts                      # MODIFY: also start the HTTP server
└── test/
    └── http.test.ts                     # NEW
```

**Responsibility split:**

- `apps/web/src/phaser/` — canvas rendering and animations only. No HTTP, no WebSocket, no business logic. Receives state via props/callbacks from the React layer.
- `apps/web/src/state/city-store.ts` — single source of truth the React components and Phaser scene both subscribe to. One event in → one store update → both canvas and HUD re-render from the same source.
- `apps/web/src/lib/event-stream.ts` — owns WebSocket lifecycle (connect, reconnect with exponential backoff, close on unmount). Calls `store.applyEvent(e)` on every received event.
- `apps/web/src/lib/snapshot.ts` — single `GET /snapshot` call that pre-populates the store before the WebSocket opens, so a fresh page load renders the current city immediately rather than waiting for the next tick.
- `apps/web/src/components/*.tsx` — React chrome. Tailwind for styling. No Phaser imports.
- `packages/orchestrator/src/http.ts` — tiny Node HTTP handler that serves a JSON snapshot of the agent state. Lives alongside the existing WS.

---

## Task 1: Orchestrator — HTTP `/snapshot` endpoint

**Files:**
- Create: `packages/orchestrator/src/http.ts`, `packages/orchestrator/test/http.test.ts`
- Modify: `packages/orchestrator/cli/run-city.ts` (start the HTTP alongside the WS)

### Step 1: Write failing test

`packages/orchestrator/test/http.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { agentRepo, intentLogRepo } from "../src/repositories.js";
import { ROSTER } from "../src/roster.js";
import { startHttp } from "../src/http.js";
import type { Server } from "node:http";

describe("startHttp /snapshot", () => {
  let dbPath: string;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `nac-http-${Date.now()}-${Math.random()}.sqlite`);
    const db = openDb(dbPath);
    const ag = agentRepo(db);
    for (const r of ROSTER) ag.upsert({ ...r, nextTickAt: 0, hustleMode: 0 });

    const log = intentLogRepo(db);
    log.insert({
      agentId: "001", tickId: "001:1", reasoning: "demo",
      templateId: "p2p_transfer", params: { memo: "hi" },
      outcome: "committed", errorPhase: null, errorCode: null, txId: "42", createdAt: 1
    });

    const handle = await startHttp({ port: 0, db, getBalance: async () => 10000 });
    server = handle.server;
    baseUrl = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    server.close();
    rmSync(dbPath, { force: true });
  });

  it("returns current agents, balances, and recent intent log entries", async () => {
    const res = await fetch(`${baseUrl}/snapshot`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toHaveLength(10);
    expect(body.agents[0].id).toBe("001");
    expect(body.agents[0].balance).toBe(10000); // per the mocked getBalance
    expect(body.recent).toBeInstanceOf(Array);
    // Recent should include the 001:1 demo entry
    expect(body.recent.find((e: any) => e.tickId === "001:1")).toBeDefined();
  });

  it("CORS: responds to OPTIONS preflight and includes Access-Control-Allow-Origin", async () => {
    const res = await fetch(`${baseUrl}/snapshot`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("404s unknown paths", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });
});
```

### Step 2: Run — should FAIL (module not found)

```bash
cd packages/orchestrator && pnpm test http
```

### Step 3: Write `packages/orchestrator/src/http.ts`

```ts
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { agentRepo, intentLogRepo } from "./repositories.js";

export interface StartHttpOptions {
  port: number;
  db: Database.Database;
  /** Returns the minor-unit balance of an account, or null on error. */
  getBalance: (address: string) => Promise<number | null>;
  /** How many recent intent-log entries per agent (default 20). */
  recentLimit?: number;
}

export interface HttpHandle {
  port: number;
  server: Server;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type"
};

export async function startHttp(opts: StartHttpOptions): Promise<HttpHandle> {
  const limit = opts.recentLimit ?? 20;
  const ag = agentRepo(opts.db);
  const log = intentLogRepo(opts.db);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/snapshot") {
      try {
        const agents = ag.list();
        const withBalances = await Promise.all(
          agents.map(async (a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            tagline: a.tagline,
            color: a.color,
            hustleMode: a.hustleMode,
            balance: (await opts.getBalance(`@agents:${a.id}:available`)) ?? 0
          }))
        );
        const recent = agents.flatMap((a) => log.recent(a.id, limit));
        recent.sort((x, y) => y.createdAt - x.createdAt);

        res.writeHead(200, { "content-type": "application/json", ...CORS });
        res.end(JSON.stringify({ agents: withBalances, recent: recent.slice(0, limit * 5) }));
      } catch (e) {
        res.writeHead(500, { "content-type": "application/json", ...CORS });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }

    res.writeHead(404, CORS);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(opts.port, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;
  return { port, server };
}
```

### Step 4: Run — should PASS (3 tests)

```bash
pnpm test http
```

### Step 5: Wire into `run-city.ts` — add HTTP boot alongside the WebSocket

Open `packages/orchestrator/cli/run-city.ts`. Find the block where `startEventBus` is called and the console logs fire. Add `startHttp` next to it.

At the top of `run-city.ts` imports, add:

```ts
import { startHttp } from "../src/http.js";
```

Then after `const bus = await startEventBus({ port: wsPort });`, add:

```ts
  const httpPort = Number(process.env.CITY_HTTP_PORT ?? 3071);
  const http = await startHttp({
    port: httpPort,
    db,
    getBalance: (addr) => ledger.getBalance(addr, "USD/2")
  });
  console.error(`[city] http      http://127.0.0.1:${http.port}/snapshot`);
```

Then in the `shutdown` handler, add `http.server.close();` before `bus.close()`.

### Step 6: Commit

```bash
git add packages/orchestrator/src/http.ts packages/orchestrator/test/http.test.ts packages/orchestrator/cli/run-city.ts
git commit -m "feat(orchestrator): HTTP /snapshot for front-end initial state

Adds a tiny HTTP server alongside the WebSocket bus (default port 3071)
that returns current agent list with live balances + recent intent-log
entries. The front end fetches this once on page load so a fresh viewer
sees the city populated immediately instead of waiting for the next
agent tick (7-13 minutes).

CORS is open for local dev. /snapshot is read-only and reveals only the
same data that would stream over the WebSocket anyway."
```

---

## Task 2: Orchestrator — `DEMO_MODE` for faster ticks

**Files:**
- Modify: `packages/orchestrator/src/tick.ts` (the two interval constants → env-configurable)

### Step 1: Open `packages/orchestrator/src/tick.ts`

Find:

```ts
const MIN_TICK_INTERVAL_MS = 7 * 60 * 1000;
const MAX_TICK_INTERVAL_MS = 13 * 60 * 1000;
```

Replace with:

```ts
// Tick intervals are env-configurable so demo/visual-testing can shorten
// them without touching production defaults. Values are milliseconds.
const DEMO = process.env.DEMO_MODE === "1";
const MIN_TICK_INTERVAL_MS = Number(process.env.TICK_MIN_MS ?? (DEMO ? 20_000  : 7 * 60 * 1000));
const MAX_TICK_INTERVAL_MS = Number(process.env.TICK_MAX_MS ?? (DEMO ? 40_000 : 13 * 60 * 1000));
```

### Step 2: Run the orchestrator tests to confirm no regression

```bash
cd packages/orchestrator && pnpm test
```

Expected: all 38 tests still pass. The defaults are unchanged when `DEMO_MODE` is unset.

### Step 3: Update `.env.example` with the new knob

Append to `.env.example`:

```
# Faster tick interval for visualization demos (20-40s instead of 7-13min)
# DEMO_MODE=1
# TICK_MIN_MS=20000
# TICK_MAX_MS=40000
```

### Step 4: Commit

```bash
git add packages/orchestrator/src/tick.ts .env.example
git commit -m "feat(orchestrator): DEMO_MODE + TICK_MIN_MS/MAX_MS env overrides

Production default stays 7-13 min. DEMO_MODE=1 shortens to 20-40s so a
viewer of the pixel city (Plan 3) sees movement within seconds instead
of minutes. Granular override for CI or stress testing."
```

---

## Task 3: Next.js app scaffold — `apps/web/`

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/tailwind.config.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/web/README.md`
- Modify: `pnpm-workspace.yaml` (add `apps/*`), root `package.json` (add `web:dev`, `web:build`)

### Step 1: Write `apps/web/package.json`

```json
{
  "name": "@nac/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint --dir src"
  },
  "dependencies": {
    "@nac/template-engine": "workspace:*",
    "next": "15.1.0",
    "phaser": "^3.87.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9",
    "eslint-config-next": "15.1.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.2"
  }
}
```

### Step 2: Write `apps/web/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": "src",
    "paths": { "@/*": ["*"] }
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Step 3: Write `apps/web/next.config.ts`

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Phaser ships pre-built UMD; let Next pass it through unbundled for the browser
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  }
};
export default config;
```

### Step 4: Write `apps/web/postcss.config.mjs`

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} }
};
```

### Step 5: Write `apps/web/tailwind.config.ts`

Tokens defined via CSS vars (see "Design direction" section) — Tailwind references them so classes stay composable without hard-coding colors twice.

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:    "var(--ink)",
        paper:  "var(--paper)",
        dim:    "var(--dim)",
        mute:   "var(--mute)",
        gold:   "var(--gold)",
        scream: "var(--scream)",
        hustle: "var(--hustle)"
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      transitionTimingFunction: {
        panel: "cubic-bezier(0.2, 0.9, 0.3, 1)"
      }
    }
  }
} satisfies Config;

export default config;
```

### Step 6: Write `apps/web/src/app/globals.css`

All chrome tasks (13-16) consume these tokens. No task hard-codes hex values except in animation keyframes where a direct reference is unavoidable.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --ink:    #0a0908;
  --paper:  #ede8df;
  --dim:    #6e6a62;
  --mute:   #3a3732;
  --gold:   #f0c457;
  --scream: #ec3a2d;
  --hustle: #d98b2b;
}

html, body {
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-mono), ui-monospace, monospace;
  font-feature-settings: "tnum" 1, "ss01" 1;
}

/* Counter-pulse keyframes (used by HudTopBar in Task 13) */
@keyframes tick-pulse {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@keyframes reject-pulse {
  0%   { transform: scale(1); color: var(--paper); }
  20%  { transform: scale(1.12); color: var(--scream); }
  100% { transform: scale(1); color: var(--paper); }
}

/* Panel slide-in (used by AgentPanel, TxPanel in Tasks 14, 15) */
@keyframes panel-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes panel-in-left  { from { transform: translateX(-100%); } to { transform: translateX(0); } }
```

### Step 7: Write `apps/web/src/app/layout.tsx`

Loads JetBrains Mono (the only typeface in the app) via `next/font/google`.

```tsx
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "Numscript Agent City",
  description: "Watch AI agents transact autonomously on a real ledger."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
```

### Step 8: Write `apps/web/src/app/page.tsx` (minimal placeholder; Task 12 replaces it)

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center font-mono text-sm text-dim">
      scaffolded — mount CityStage in Task 12
    </main>
  );
}
```

### Step 9: Update `pnpm-workspace.yaml`

Replace the current content (which only has `packages/*`) with:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### Step 10: Add root scripts

In the root `package.json`, add to the `scripts` block:

```json
    "web:dev": "pnpm --filter @nac/web dev",
    "web:build": "pnpm --filter @nac/web build"
```

### Step 11: Install + boot

```bash
pnpm install
pnpm web:build
```

Expected: Next builds with no errors. A `dev` run serves the placeholder at http://localhost:3000.

### Step 12: Commit

```bash
git add apps/web pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "feat(web): Next.js 15 app scaffold (@nac/web)"
```

---

## Task 4: Kenney asset pack download + license record

**Files:**
- Create: `apps/web/public/assets/tiny-town/` (tileset), `apps/web/public/assets/characters/` (character sheet)
- Create: `apps/web/public/assets/LICENSE.md` (Kenney CC0 attribution)

### Step 1: Download the Kenney Tiny Town pack

Run from the repo root:

```bash
mkdir -p apps/web/public/assets/tiny-town apps/web/public/assets/characters
curl -fsSL -o /tmp/tiny-town.zip https://kenney.nl/media/pages/assets/tiny-town/34fa97ce50-1740575830/kenney_tiny-town.zip
unzip -o -q /tmp/tiny-town.zip -d /tmp/tiny-town
cp /tmp/tiny-town/Tilemap/tilemap.png            apps/web/public/assets/tiny-town/tilemap.png
cp /tmp/tiny-town/Tilemap/tilemap_packed.png     apps/web/public/assets/tiny-town/tilemap_packed.png
cp /tmp/tiny-town/Tilemap/tilemap.csv            apps/web/public/assets/tiny-town/tilemap.csv
```

If the direct URL has rotated, fetch https://kenney.nl/assets/tiny-town manually and place the same files.

### Step 2: Download Kenney Tiny Characters

```bash
curl -fsSL -o /tmp/tiny-chars.zip https://kenney.nl/media/pages/assets/tiny-dungeon/cce0652b55-1740575864/kenney_tiny-dungeon.zip
unzip -o -q /tmp/tiny-chars.zip -d /tmp/tiny-chars
cp /tmp/tiny-chars/Tilemap/tilemap_packed.png apps/web/public/assets/characters/tiny-characters.png
```

We'll tint each sprite per-agent using the roster's `color` field, so one base spritesheet is fine.

### Step 3: Write `apps/web/public/assets/LICENSE.md`

```markdown
# Sprite assets — attribution

This directory contains sprites from Kenney (https://kenney.nl), released under
**CC0 1.0 Universal**. No attribution is required, but acknowledged here as
good practice.

- `tiny-town/*` — from "Tiny Town" pack
- `characters/tiny-characters.png` — from "Tiny Dungeon" pack, used for agent sprites

Tinting + animation choices are original to this project and inherit the same CC0
terms per Kenney's license.
```

### Step 4: Verify size / shape

```bash
file apps/web/public/assets/tiny-town/tilemap.png
file apps/web/public/assets/characters/tiny-characters.png
```

Expected: both are PNG files under ~50 KB each.

### Step 5: Commit

```bash
git add apps/web/public/assets
git commit -m "assets: import Kenney Tiny Town + Tiny Dungeon sprites (CC0)"
```

---

## Task 5: Event-schema discriminated union (shared types)

**Files:**
- Create: `apps/web/src/lib/event-schema.ts`

Front end should switch on `event.kind` with full type narrowing on `event.data`. The orchestrator's `CityEvent.data: Record<string, unknown>` is too loose for the UI. This file defines the UI-side typed shape.

### Step 1: Write `apps/web/src/lib/event-schema.ts`

```ts
// Mirrors packages/orchestrator/src/types.ts#CityEvent but narrows data per kind.

export type AgentId = string;
export type TickId = string;

interface Base {
  agentId: AgentId;
  tickId: TickId;
  at: number;
}

export type CityEvent =
  | (Base & { kind: "tick-start" })
  | (Base & { kind: "intent";              data: { tool: string; input: Record<string, unknown>; reasoning: string } })
  | (Base & { kind: "dry-run" })
  | (Base & { kind: "committed";           data: { templateId: string; txId: string } })
  | (Base & { kind: "rejected";            data: { phase: RejectionPhase; code: string; message: string } })
  | (Base & { kind: "idle" })
  | (Base & { kind: "hustle-enter" })
  | (Base & { kind: "hustle-exit" })
  | (Base & { kind: "relationship-update"; data: { peerId: AgentId; trust: number } });

export type RejectionPhase = "load" | "validate" | "render" | "dry-run" | "commit" | "authorization" | "scheduler";

// Narrowing helper for switch-exhaustiveness in consumers.
export function matchEvent<T>(e: CityEvent, handlers: {
  [K in CityEvent["kind"]]: (e: Extract<CityEvent, { kind: K }>) => T
}): T {
  // @ts-expect-error — TS can't prove the index is exhaustive without a large type dance
  return handlers[e.kind](e);
}
```

### Step 2: Commit (no test — pure type declarations)

```bash
git add apps/web/src/lib/event-schema.ts
git commit -m "feat(web): discriminated CityEvent union for UI consumers"
```

---

## Task 6: City-store (Zustand)

**Files:**
- Create: `apps/web/src/state/city-store.ts`

Single in-browser source of truth. React components AND the Phaser scene subscribe to it. Writes happen from `snapshot.ts` (initial) and `event-stream.ts` (deltas).

### Step 1: Write `apps/web/src/state/city-store.ts`

```ts
"use client";
import { create } from "zustand";
import type { CityEvent } from "../lib/event-schema";

export interface AgentView {
  id: string;
  name: string;
  role: string;
  tagline: string;
  color: string;
  balance: number;        // USD/2 minor units
  hustleMode: 0 | 1;
  x: number;              // tile coord; assigned at snapshot time
  y: number;
}

export interface IntentLogView {
  agentId: string;
  tickId: string;
  reasoning: string;
  templateId: string | null;
  params: Record<string, unknown> | null;
  outcome: "committed" | "rejected" | "idle";
  errorPhase: string | null;
  errorCode: string | null;
  txId: string | null;
  createdAt: number;
}

interface CityState {
  agents: Record<string, AgentView>;
  recent: IntentLogView[];      // newest first, capped
  ticksToday: number;
  committedToday: number;
  rejectedToday: number;
  bootedAt: number;             // epoch ms

  hydrate: (args: { agents: AgentView[]; recent: IntentLogView[] }) => void;
  applyEvent: (e: CityEvent) => void;
}

const RECENT_CAP = 200;

// A deterministic 4×3 tile layout for the 10 agents, anchored in open ground.
// Plan 3's tile grid is a 16×10 space; agents start here and wander via random walk.
const START_POSITIONS: Record<string, [number, number]> = {
  "001": [ 3, 3], "002": [ 5, 3], "003": [ 7, 3], "004": [ 9, 3], "005": [11, 3],
  "006": [ 3, 5], "007": [ 5, 5], "008": [ 7, 5], "009": [ 9, 5], "010": [11, 5]
};

export const useCityStore = create<CityState>((set) => ({
  agents: {},
  recent: [],
  ticksToday: 0,
  committedToday: 0,
  rejectedToday: 0,
  bootedAt: Date.now(),

  hydrate({ agents, recent }) {
    const byId: Record<string, AgentView> = {};
    for (const a of agents) {
      const [x, y] = START_POSITIONS[a.id] ?? [0, 0];
      byId[a.id] = { ...a, x, y };
    }
    set({ agents: byId, recent: recent.slice(0, RECENT_CAP) });
  },

  applyEvent(e) {
    set((s) => {
      const next: Partial<CityState> = {};

      if (e.kind === "tick-start") next.ticksToday = s.ticksToday + 1;
      if (e.kind === "committed") next.committedToday = s.committedToday + 1;
      if (e.kind === "rejected") next.rejectedToday = s.rejectedToday + 1;

      if (e.kind === "hustle-enter" && s.agents[e.agentId]) {
        next.agents = { ...s.agents, [e.agentId]: { ...s.agents[e.agentId], hustleMode: 1 } };
      }
      if (e.kind === "hustle-exit" && s.agents[e.agentId]) {
        next.agents = { ...s.agents, [e.agentId]: { ...s.agents[e.agentId], hustleMode: 0 } };
      }

      // Intent / committed / rejected / idle all get logged
      if (e.kind === "intent" || e.kind === "committed" || e.kind === "rejected" || e.kind === "idle") {
        const entry: IntentLogView = {
          agentId: e.agentId,
          tickId: e.tickId,
          reasoning: e.kind === "intent" ? (e as any).data?.reasoning ?? "" : "",
          templateId: e.kind === "intent" ? (e as any).data?.tool ?? null
                    : e.kind === "committed" ? (e as any).data?.templateId ?? null
                    : null,
          params: e.kind === "intent" ? (e as any).data?.input ?? null : null,
          outcome: e.kind === "committed" ? "committed"
                 : e.kind === "rejected" ? "rejected"
                 : e.kind === "idle" ? "idle"
                 : "committed", // intent alone isn't an outcome; a later committed/rejected replaces it
          errorPhase: e.kind === "rejected" ? (e as any).data?.phase ?? null : null,
          errorCode:  e.kind === "rejected" ? (e as any).data?.code  ?? null : null,
          txId:       e.kind === "committed" ? (e as any).data?.txId ?? null : null,
          createdAt: e.at
        };
        next.recent = [entry, ...s.recent].slice(0, RECENT_CAP);
      }

      return next;
    });
  }
}));
```

### Step 2: Commit

```bash
git add apps/web/src/state/city-store.ts
git commit -m "feat(web): Zustand city store — hydrate + applyEvent"
```

---

## Task 7: Snapshot HTTP client

**Files:**
- Create: `apps/web/src/lib/snapshot.ts`

### Step 1: Write `apps/web/src/lib/snapshot.ts`

```ts
import type { AgentView, IntentLogView } from "../state/city-store";

const DEFAULT_BASE = process.env.NEXT_PUBLIC_CITY_HTTP_URL ?? "http://127.0.0.1:3071";

interface SnapshotPayload {
  agents: Array<Omit<AgentView, "x" | "y">>;
  recent: IntentLogView[];
}

export async function fetchSnapshot(baseUrl = DEFAULT_BASE): Promise<SnapshotPayload> {
  const res = await fetch(`${baseUrl}/snapshot`, { cache: "no-store" });
  if (!res.ok) throw new Error(`snapshot failed: HTTP ${res.status}`);
  return (await res.json()) as SnapshotPayload;
}
```

### Step 2: Commit

```bash
git add apps/web/src/lib/snapshot.ts
git commit -m "feat(web): /snapshot http client"
```

---

## Task 8: WebSocket event stream (reconnecting)

**Files:**
- Create: `apps/web/src/lib/event-stream.ts`

### Step 1: Write `apps/web/src/lib/event-stream.ts`

```ts
import type { CityEvent } from "./event-schema";

const DEFAULT_URL = process.env.NEXT_PUBLIC_CITY_WS_URL ?? "ws://127.0.0.1:3070";

export interface StreamHandle {
  close(): void;
}

export function connectEventStream(
  onEvent: (e: CityEvent) => void,
  url: string = DEFAULT_URL
): StreamHandle {
  let closed = false;
  let ws: WebSocket | null = null;
  let backoff = 500;

  function open() {
    if (closed) return;
    ws = new WebSocket(url);

    ws.onopen = () => { backoff = 500; };
    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(String(ev.data)) as CityEvent); }
      catch { /* drop malformed frame */ }
    };
    ws.onclose = () => {
      if (closed) return;
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, 10_000);
    };
    ws.onerror = () => ws?.close();
  }

  open();

  return {
    close() {
      closed = true;
      ws?.close();
    }
  };
}
```

### Step 2: Commit

```bash
git add apps/web/src/lib/event-stream.ts
git commit -m "feat(web): reconnecting WebSocket client for the event bus"
```

---

## Task 9: Phaser boot + base scene

**Files:**
- Create: `apps/web/src/phaser/boot.ts`, `apps/web/src/phaser/scenes/CityScene.ts`

### Step 1: Write `apps/web/src/phaser/scenes/CityScene.ts` (skeleton — Tasks 10-13 fill in)

```ts
import Phaser from "phaser";

export const TILE = 16;
export const GRID_W = 20;
export const GRID_H = 12;

export class CityScene extends Phaser.Scene {
  constructor() { super({ key: "city" }); }

  preload() {
    this.load.image("tiles", "/assets/tiny-town/tilemap_packed.png");
    this.load.spritesheet("chars", "/assets/characters/tiny-characters.png", {
      frameWidth: 16, frameHeight: 16
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#1a2f1a");
    this.buildGround();
    this.buildBuildings();
    // Agent sprites wire in Task 10 via registry events.
  }

  private buildGround(): void {
    // Grass tile index (Kenney Tiny Town tilemap_packed.png). Tile 0/1 is grass
    // in the top row. Render a GRID_W × GRID_H carpet.
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, "tiles", 0)
          .setDisplaySize(TILE, TILE);
      }
    }
  }

  private buildBuildings(): void {
    // Six buildings at fixed tile coords. Kenney's tile 59 is "house A".
    const defs: Array<{ tx: number; ty: number; tile: number; label: string }> = [
      { tx:  2, ty:  1, tile: 59, label: "Market" },
      { tx:  6, ty:  1, tile: 61, label: "Bank" },
      { tx: 10, ty:  1, tile: 63, label: "Post Office" },
      { tx: 14, ty:  1, tile: 65, label: "Inspector's Desk" },
      { tx:  4, ty:  8, tile: 67, label: "Liquidity Pool" },
      { tx: 12, ty:  8, tile: 69, label: "Escrow Vault" }
    ];
    for (const d of defs) {
      this.add.image(d.tx * TILE + TILE / 2, d.ty * TILE + TILE / 2, "tiles", d.tile)
        .setDisplaySize(TILE * 2, TILE * 2);
      this.add.text(d.tx * TILE + TILE, d.ty * TILE - 2, d.label, {
        fontFamily: "ui-monospace, monospace",
        fontSize: "8px",
        color: "#e8e8e6"
      }).setOrigin(0.5, 1);
    }
  }
}
```

### Step 2: Write `apps/web/src/phaser/boot.ts`

```ts
import Phaser from "phaser";
import { CityScene, TILE, GRID_W, GRID_H } from "./scenes/CityScene";

export function bootPhaser(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GRID_W * TILE,
    height: GRID_H * TILE,
    pixelArt: true,
    antialias: false,
    zoom: 3,
    backgroundColor: "#1a2f1a",
    scene: [CityScene]
  });
}
```

### Step 3: Commit

```bash
git add apps/web/src/phaser/boot.ts apps/web/src/phaser/scenes/CityScene.ts
git commit -m "feat(web): Phaser boot + CityScene skeleton (ground + 6 buildings)"
```

---

## Task 10: Agent sprite + random-walk movement

**Files:**
- Create: `apps/web/src/phaser/agent-sprite.ts`
- Modify: `apps/web/src/phaser/scenes/CityScene.ts`

### Step 1: Write `apps/web/src/phaser/agent-sprite.ts`

```ts
import Phaser from "phaser";
import { TILE, GRID_W, GRID_H } from "./scenes/CityScene";
import type { AgentView } from "../state/city-store";

// Small walker around the grid. Maintains an integer tile coord, moves 1 tile
// at a time on a timer. Tint is taken from the agent's roster color.
export class AgentSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private tx: number;
  private ty: number;

  constructor(scene: Phaser.Scene, public readonly agent: AgentView) {
    this.tx = agent.x;
    this.ty = agent.y;
    this.sprite = scene.add.sprite(this.px(), this.py(), "chars", 84) // char frame 84 = default humanoid
      .setDisplaySize(TILE, TILE)
      .setTint(this.hexToNumber(agent.color));
    this.label = scene.add.text(this.px(), this.py() - TILE * 0.75, agent.name, {
      fontFamily: "ui-monospace, monospace",
      fontSize: "6px",
      color: "#e8e8e6"
    }).setOrigin(0.5, 1);

    scene.time.addEvent({
      delay: Phaser.Math.Between(1200, 2200),
      loop: true,
      callback: () => this.step(scene)
    });
  }

  private step(scene: Phaser.Scene): void {
    const dx = Phaser.Math.Between(-1, 1);
    const dy = Phaser.Math.Between(-1, 1);
    const nx = Phaser.Math.Clamp(this.tx + dx, 0, GRID_W - 1);
    const ny = Phaser.Math.Clamp(this.ty + dy, 2, GRID_H - 2); // avoid building row
    this.tx = nx; this.ty = ny;

    scene.tweens.add({
      targets: [this.sprite, this.label],
      x: this.px(),
      y: (t: any) => t === this.label ? this.py() - TILE * 0.75 : this.py(),
      duration: 400,
      ease: "sine.inOut"
    });
  }

  worldX(): number { return this.px(); }
  worldY(): number { return this.py(); }

  private px(): number { return this.tx * TILE + TILE / 2; }
  private py(): number { return this.ty * TILE + TILE / 2; }

  private hexToNumber(hex: string): number {
    return parseInt(hex.replace("#", ""), 16);
  }
}
```

### Step 2: Modify `CityScene.ts` to mount agents from the store

Open `apps/web/src/phaser/scenes/CityScene.ts`. Add a store subscription — the scene reads the current `agents` map on `create` and whenever a hustle flag changes. Keep a `Map<agentId, AgentSprite>`.

At the top:

```ts
import { useCityStore } from "../../state/city-store";
import { AgentSprite } from "../agent-sprite";
```

Add a property and mount-on-create:

```ts
  private agents = new Map<string, AgentSprite>();

  create() {
    this.cameras.main.setBackgroundColor("#1a2f1a");
    this.buildGround();
    this.buildBuildings();

    const initial = useCityStore.getState().agents;
    for (const a of Object.values(initial)) this.spawn(a);

    // React to hydrations that happen AFTER create (first-load race)
    useCityStore.subscribe((s, prev) => {
      for (const a of Object.values(s.agents)) {
        if (!this.agents.has(a.id)) this.spawn(a);
      }
    });
  }

  private spawn(a: any): void {
    this.agents.set(a.id, new AgentSprite(this, a));
  }
```

### Step 3: Sanity check

```bash
pnpm --filter @nac/web build
```

Expected: build completes. The dev server would render sprites once `hydrate()` has been called by the snapshot fetch (which comes in Task 12).

### Step 4: Commit

```bash
git add apps/web/src/phaser/agent-sprite.ts apps/web/src/phaser/scenes/CityScene.ts
git commit -m "feat(web): agent sprites with random-walk movement + name labels"
```

---

## Task 11: Coin-flow particles + amount popups + barrier animations

**Files:**
- Create: `apps/web/src/phaser/coin-flow.ts`, `apps/web/src/phaser/amount-popup.ts`, `apps/web/src/phaser/barrier.ts`
- Modify: `apps/web/src/phaser/scenes/CityScene.ts`

### Step 1: Write `apps/web/src/phaser/coin-flow.ts`

```ts
import Phaser from "phaser";

/** Emit a small trail of coin-colored dots from (x1,y1) → (x2,y2) over `duration` ms. */
export function emitCoins(
  scene: Phaser.Scene,
  x1: number, y1: number, x2: number, y2: number,
  duration = 700
): void {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const dot = scene.add.circle(x1, y1, 1.5, 0xf5c542);
    scene.tweens.add({
      targets: dot,
      x: x2, y: y2,
      duration,
      delay: t * 120,
      ease: "sine.inOut",
      onComplete: () => dot.destroy()
    });
  }
}
```

### Step 2: Write `apps/web/src/phaser/amount-popup.ts`

```ts
import Phaser from "phaser";

export function floatPopup(
  scene: Phaser.Scene,
  x: number, y: number,
  text: string,
  color: string = "#6fa86a"
): void {
  const t = scene.add.text(x, y, text, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "7px",
    color
  }).setOrigin(0.5, 1);

  scene.tweens.add({
    targets: t,
    y: y - 20,
    alpha: 0,
    duration: 1200,
    ease: "cubic.out",
    onComplete: () => t.destroy()
  });
}
```

### Step 3: Write `apps/web/src/phaser/barrier.ts`

```ts
import Phaser from "phaser";

export type BarrierKind = "authorization" | "validate" | "commit" | "load" | "other";

/**
 * Show a brief animated shield + label at (x,y). Each rejection phase gets its
 * own visual so a watcher learns which guard caught which kind of attempt.
 */
export function showBarrier(scene: Phaser.Scene, x: number, y: number, kind: BarrierKind, code: string): void {
  const color =
    kind === "authorization" ? 0xd63028 :
    kind === "validate"      ? 0x4a90e2 :
    kind === "commit"        ? 0xb22222 :
    0x888888;

  const ring = scene.add.circle(x, y, 2, color).setStrokeStyle(1, color);
  scene.tweens.add({
    targets: ring,
    radius: 12,
    alpha: 0,
    duration: 600,
    ease: "cubic.out",
    onComplete: () => ring.destroy()
  });

  const label = scene.add.text(x, y + 3, code, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "6px",
    color: "#ff5a36"
  }).setOrigin(0.5, 0);
  scene.tweens.add({
    targets: label,
    y: y + 14,
    alpha: 0,
    duration: 900,
    onComplete: () => label.destroy()
  });
}
```

### Step 4: Wire into `CityScene.ts` — subscribe to store events

Open `CityScene.ts`. Replace the `useCityStore.subscribe` block added in Task 10 with a richer one that also reacts to new `recent` entries (committed / rejected). Add at the top:

```ts
import { emitCoins } from "../coin-flow";
import { floatPopup } from "../amount-popup";
import { showBarrier, type BarrierKind } from "../barrier";
```

Replace the subscribe call with:

```ts
    let seenTickIds = new Set<string>();
    useCityStore.subscribe((s) => {
      // Mount any agents that came in late
      for (const a of Object.values(s.agents)) {
        if (!this.agents.has(a.id)) this.spawn(a);
      }
      // Animate any new recent entries
      for (const r of s.recent) {
        if (seenTickIds.has(r.tickId)) break; // newest-first, so we can stop once we see a known one
        seenTickIds.add(r.tickId);
        this.animateForEntry(r);
      }
    });
```

Add the `animateForEntry` method inside the class:

```ts
  private animateForEntry(r: { agentId: string; outcome: string; templateId: string | null; errorPhase: string | null; errorCode: string | null; params: Record<string, unknown> | null }): void {
    const src = this.agents.get(r.agentId);
    if (!src) return;

    if (r.outcome === "committed") {
      // Pull the first account-typed param as counterparty, if any
      const peerId = this.counterpartyFromParams(r.params);
      const dst = peerId ? this.agents.get(peerId) : undefined;
      if (dst) emitCoins(this, src.worldX(), src.worldY(), dst.worldX(), dst.worldY(), 700);
      floatPopup(this, src.worldX(), src.worldY() - 8, `✓ ${r.templateId}`);
    } else if (r.outcome === "rejected") {
      const kind: BarrierKind =
        r.errorPhase === "authorization" ? "authorization" :
        r.errorPhase === "validate"      ? "validate" :
        r.errorPhase === "commit"        ? "commit" :
        r.errorPhase === "load"          ? "load" : "other";
      showBarrier(this, src.worldX(), src.worldY(), kind, r.errorCode ?? "REJECTED");
    }
    // outcome "idle" produces no visual
  }

  private counterpartyFromParams(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    for (const v of Object.values(params)) {
      if (typeof v === "string") {
        const m = v.match(/^@agents:([0-9]+):.+$/);
        if (m) return m[1];
      }
    }
    return null;
  }
```

### Step 5: Commit

```bash
git add apps/web/src/phaser/coin-flow.ts apps/web/src/phaser/amount-popup.ts apps/web/src/phaser/barrier.ts apps/web/src/phaser/scenes/CityScene.ts
git commit -m "feat(web): coin flows, amount popups, 4-style barrier animations

Commits emit gold-dot trails between source + counterparty agents + a
'✓ template_id' popup. Rejections show a colored shield + the error
code, with color keyed to phase (authorization = vermillion, validate
= blue, commit = deep red, other = gray). This is the visual core of
the city."
```

---

## Task 12: `CityStage` React wrapper + snapshot-then-stream boot

**Files:**
- Create: `apps/web/src/components/CityStage.tsx`
- Modify: `apps/web/src/app/page.tsx`

### Step 1: Write `apps/web/src/components/CityStage.tsx`

```tsx
"use client";
import { useEffect, useRef } from "react";
import { bootPhaser } from "../phaser/boot";
import { fetchSnapshot } from "../lib/snapshot";
import { connectEventStream } from "../lib/event-stream";
import { useCityStore } from "../state/city-store";
import type Phaser from "phaser";

export default function CityStage() {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!parentRef.current) return;
    gameRef.current = bootPhaser(parentRef.current);

    (async () => {
      try {
        const snap = await fetchSnapshot();
        useCityStore.getState().hydrate({
          agents: snap.agents.map((a) => ({ ...a, x: 0, y: 0 })),
          recent: snap.recent
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("snapshot unavailable — falling back to zero state", e);
      }
    })();

    const stream = connectEventStream((e) => useCityStore.getState().applyEvent(e));

    return () => {
      stream.close();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-ink">
      <div ref={parentRef} className="shadow-2xl rounded-sm overflow-hidden" />
    </div>
  );
}
```

### Step 2: Replace `apps/web/src/app/page.tsx`

```tsx
import dynamic from "next/dynamic";

const CityStage = dynamic(() => import("../components/CityStage"), { ssr: false });

export default function Home() {
  return <CityStage />;
}
```

### Step 3: End-to-end dev smoke (manual)

Run the backend:

```bash
pnpm ledger:up && pnpm seed-genesis && DEMO_MODE=1 pnpm city:start
```

In another terminal:

```bash
pnpm web:dev
```

Open http://localhost:3000. Expected: a pixel village with 10 colored agents walking around. Within ~30-60 seconds (DEMO_MODE), coin trails and amount popups should appear on the canvas as agents tick.

### Step 4: Commit

```bash
git add apps/web/src/components/CityStage.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): CityStage — mounts Phaser, hydrates from /snapshot, applies WS deltas"
```

---

## Task 13: HUD top-bar — live counters

**Files:**
- Create: `apps/web/src/components/HudTopBar.tsx`
- Modify: `apps/web/src/components/CityStage.tsx` (render HUD over the canvas)

### Step 1: Write `apps/web/src/components/HudTopBar.tsx`

```tsx
"use client";
import { useCityStore } from "../state/city-store";
import { useEffect, useState } from "react";

function fmtUsd(minor: number): string {
  return (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function useUptime(bootedAt: number): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor((now - bootedAt) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export default function HudTopBar() {
  const agents = useCityStore((s) => s.agents);
  const ticksToday = useCityStore((s) => s.ticksToday);
  const rejectedToday = useCityStore((s) => s.rejectedToday);
  const bootedAt = useCityStore((s) => s.bootedAt);

  const total = Object.values(agents).reduce((sum, a) => sum + a.balance, 0);
  const uptime = useUptime(bootedAt);

  return (
    <div className="absolute inset-x-0 top-0 px-5 py-3 flex justify-between items-center font-mono text-[11px] text-paper bg-ink border-b border-mute pointer-events-none select-none">
      <div className="flex items-center gap-2.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-scream" style={{ boxShadow: "0 0 8px var(--scream)" }} />
        <span className="font-semibold tracking-[0.15em] text-paper">NUMSCRIPT · AGENT CITY</span>
      </div>
      <div className="flex gap-7 items-baseline">
        <Stat label="in circulation" value={fmtUsd(total)} />
        <Stat label="ticks" value={String(ticksToday)} kind="tick" changeKey={ticksToday} />
        <Stat label="rejected" value={String(rejectedToday)} kind="reject" changeKey={rejectedToday} />
        <Stat label="uptime" value={uptime} />
      </div>
    </div>
  );
}

function Stat({ label, value, kind, changeKey }: { label: string; value: string; kind?: "tick" | "reject"; changeKey?: number }) {
  // Pulse the value when changeKey mutates. Reject pulse uses --scream; tick pulse is neutral scale-up.
  const [pulseCount, setPulseCount] = useState(0);
  useEffect(() => { setPulseCount((n) => n + 1); }, [changeKey]);
  const animation = kind === "reject" ? "reject-pulse 200ms ease-out"
                  : kind === "tick"   ? "tick-pulse 200ms ease-out"
                  : "none";
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        key={`${label}-${pulseCount}`}
        className="tabular-nums text-paper text-[13px] font-medium inline-block"
        style={{ animation }}
      >
        {value}
      </span>
      <span className="text-[9px] uppercase tracking-[0.18em] text-dim">{label}</span>
    </div>
  );
}
```

### Step 2: Modify `CityStage.tsx` — render HUD over the canvas

Find the return statement and replace it with:

```tsx
  return (
    <div className="relative min-h-screen bg-ink">
      <div ref={parentRef} className="flex min-h-screen items-center justify-center" />
      <HudTopBar />
    </div>
  );
```

Add the import at the top of the file: `import HudTopBar from "./HudTopBar";`

### Step 3: Commit

```bash
git add apps/web/src/components/HudTopBar.tsx apps/web/src/components/CityStage.tsx
git commit -m "feat(web): HUD top-bar with in-circulation / ticks / rejected / uptime"
```

---

## Task 14: Agent hover card + click → profile panel

**Files:**
- Create: `apps/web/src/components/AgentCard.tsx`, `apps/web/src/components/AgentPanel.tsx`
- Modify: `apps/web/src/phaser/agent-sprite.ts` (emit hover/click events via Phaser registry), `apps/web/src/components/CityStage.tsx` (subscribe + render)

Front end gets two pieces of UI for agent inspection: a lightweight hover card that follows the cursor, and a slide-in panel on click with the full intent log.

### Step 1: Emit agent-hover / agent-click events from `agent-sprite.ts`

Replace the `AgentSprite` constructor to make the sprite interactive and publish DOM `CustomEvent`s (simpler than bridging Phaser events into React state):

Open `apps/web/src/phaser/agent-sprite.ts`. After the `scene.add.text(...)` assignment and before the `scene.time.addEvent`, add:

```ts
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerover", () => {
      window.dispatchEvent(new CustomEvent("nac:agent-hover", { detail: { id: agent.id, x: this.px() * 3, y: this.py() * 3 } }));
    });
    this.sprite.on("pointerout", () => {
      window.dispatchEvent(new CustomEvent("nac:agent-hover", { detail: null }));
    });
    this.sprite.on("pointerdown", () => {
      window.dispatchEvent(new CustomEvent("nac:agent-click", { detail: { id: agent.id } }));
    });
```

(The `x * 3` accounts for Phaser's zoom=3 in `boot.ts`, mapping canvas coords to DOM pixel offsets within the canvas element.)

### Step 2: Write `apps/web/src/components/AgentCard.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

type Hover = { id: string; x: number; y: number } | null;

export default function AgentCard() {
  const [hover, setHover] = useState<Hover>(null);
  const agents = useCityStore((s) => s.agents);

  useEffect(() => {
    const h = (e: Event) => setHover((e as CustomEvent).detail);
    window.addEventListener("nac:agent-hover", h);
    return () => window.removeEventListener("nac:agent-hover", h);
  }, []);

  if (!hover) return null;
  const a = agents[hover.id];
  if (!a) return null;

  return (
    <div
      className="absolute z-10 font-mono text-[11px] bg-ink border border-mute px-3 py-2 pointer-events-none"
      style={{ left: hover.x + 12, top: hover.y - 40 }}
    >
      <div className="font-semibold text-paper">{a.name} <span className="text-dim">· {a.role}</span></div>
      <div className="text-dim text-[10px] italic mt-0.5 max-w-[36ch]">{a.tagline}</div>
      <div className="mt-1 text-paper tabular-nums">${(a.balance / 100).toFixed(2)}{a.hustleMode ? <span className="ml-1.5 text-scream">♦ hustle</span> : null}</div>
    </div>
  );
}
```

### Step 3: Write `apps/web/src/components/AgentPanel.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

export default function AgentPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const agents = useCityStore((s) => s.agents);
  const recent = useCityStore((s) => s.recent);

  useEffect(() => {
    const h = (e: Event) => setOpenId((e as CustomEvent).detail.id);
    window.addEventListener("nac:agent-click", h);
    return () => window.removeEventListener("nac:agent-click", h);
  }, []);

  if (!openId) return null;
  const a = agents[openId];
  if (!a) return null;

  const entries = recent.filter((r) => r.agentId === a.id).slice(0, 25);

  return (
    <aside
      className="absolute z-20 top-0 right-0 h-screen w-[420px] bg-ink border-l border-mute p-5 font-mono text-[12px] overflow-y-auto"
      style={{ animation: "panel-in-right 240ms var(--panel-ease, cubic-bezier(0.2,0.9,0.3,1)) both" }}
    >
      <div className="flex justify-between items-baseline">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dim">Agent {a.id}</div>
          <h2 className="text-lg font-semibold text-paper">{a.name}</h2>
          <div className="text-dim text-[11px]">{a.role} · ${(a.balance / 100).toFixed(2)}{a.hustleMode ? " · ♦ hustle" : ""}</div>
        </div>
        <button onClick={() => setOpenId(null)} className="text-dim hover:text-paper text-lg leading-none">×</button>
      </div>

      <p className="mt-3 italic text-dim">{a.tagline}</p>

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Intent log</h3>
      <ul className="space-y-2">
        {entries.length === 0 && <li className="text-dim italic">no events yet</li>}
        {entries.map((r) => (
          <li key={r.tickId} className="border-l-2 pl-2" style={{ borderColor: outcomeColor(r.outcome) }}>
            <div className="text-dim text-[10px]">{new Date(r.createdAt).toLocaleTimeString()}  ·  {r.tickId}</div>
            <div className="text-paper">
              {r.outcome === "committed" && <span className="text-[#6fa86a]">✓ {r.templateId}</span>}
              {r.outcome === "rejected"  && <span className="text-scream">✗ {r.errorCode} <span className="text-dim">({r.errorPhase})</span></span>}
              {r.outcome === "idle"      && <span className="text-dim">idle</span>}
            </div>
            {r.reasoning && <div className="text-dim text-[11px] mt-0.5 italic">"{r.reasoning}"</div>}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function outcomeColor(o: string): string {
  if (o === "committed") return "#6fa86a";
  if (o === "rejected") return "#ff5a36";
  return "#5a5a58";
}
```

### Step 4: Mount both in `CityStage.tsx`

Add imports at the top:
```tsx
import AgentCard from "./AgentCard";
import AgentPanel from "./AgentPanel";
```

Update the return block to include them:

```tsx
  return (
    <div className="relative min-h-screen bg-ink">
      <div ref={parentRef} className="flex min-h-screen items-center justify-center" />
      <HudTopBar />
      <AgentCard />
      <AgentPanel />
    </div>
  );
```

### Step 5: Commit

```bash
git add apps/web/src/phaser/agent-sprite.ts apps/web/src/components/AgentCard.tsx apps/web/src/components/AgentPanel.tsx apps/web/src/components/CityStage.tsx
git commit -m "feat(web): hover card + click-to-open agent profile panel with intent log"
```

---

## Task 15: Transaction detail panel (click a committed/rejected popup)

**Files:**
- Create: `apps/web/src/components/TxPanel.tsx`
- Modify: `apps/web/src/phaser/scenes/CityScene.ts` (make popups clickable → emit `nac:tx-click`)

### Step 1: Modify `CityScene.animateForEntry`

Replace `floatPopup(this, src.worldX(), src.worldY() - 8, \`✓ ${r.templateId}\`);` with a version that also makes the text interactive. Extract the popup into a return value so we can wire events:

Open `apps/web/src/phaser/amount-popup.ts`. Add a new export that returns the text object:

```ts
export function floatPopupClickable(
  scene: Phaser.Scene,
  x: number, y: number,
  text: string,
  color: string,
  onClick: () => void
): void {
  const t = scene.add.text(x, y, text, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "7px",
    color
  }).setOrigin(0.5, 1);
  t.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);

  scene.tweens.add({
    targets: t,
    y: y - 20,
    alpha: 0,
    duration: 1800, // slightly longer so users can catch the click
    ease: "cubic.out",
    onComplete: () => t.destroy()
  });
}
```

In `CityScene.animateForEntry`, replace the commit branch's popup call with:

```ts
      floatPopupClickable(
        this,
        src.worldX(), src.worldY() - 8,
        `✓ ${r.templateId}`,
        "#6fa86a",
        () => window.dispatchEvent(new CustomEvent("nac:tx-click", { detail: { tickId: r.tickId } }))
      );
```

Similarly, update `showBarrier` to be clickable if you want rejection details on click — for v1 keep barriers non-interactive (they auto-fade), and the agent panel's intent log already lists them.

Add the import: `import { floatPopupClickable } from "../amount-popup";`

### Step 2: Write `apps/web/src/components/TxPanel.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";
import { useCityStore } from "../state/city-store";

export default function TxPanel() {
  const [tickId, setTickId] = useState<string | null>(null);
  const recent = useCityStore((s) => s.recent);

  useEffect(() => {
    const h = (e: Event) => setTickId((e as CustomEvent).detail.tickId);
    window.addEventListener("nac:tx-click", h);
    return () => window.removeEventListener("nac:tx-click", h);
  }, []);

  if (!tickId) return null;
  const r = recent.find((x) => x.tickId === tickId);
  if (!r) return null;

  return (
    <aside
      className="absolute z-20 top-0 left-0 h-screen w-[460px] bg-ink border-r border-mute p-5 font-mono text-[12px] overflow-y-auto"
      style={{ animation: "panel-in-left 240ms var(--panel-ease, cubic-bezier(0.2,0.9,0.3,1)) both" }}
    >
      <div className="flex justify-between items-baseline">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-dim">Transaction</div>
          <h2 className="text-lg font-semibold text-paper">{r.templateId}</h2>
          <div className="text-dim text-[11px]">{r.tickId}  ·  agent {r.agentId}{r.txId ? `  ·  tx ${r.txId}` : ""}</div>
        </div>
        <button onClick={() => setTickId(null)} className="text-dim hover:text-paper text-lg leading-none">×</button>
      </div>

      {r.reasoning && (
        <div className="mt-3 text-[11px] italic text-dim">"{r.reasoning}"</div>
      )}

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Parameters</h3>
      <pre className="bg-ink border border-mute p-2.5 whitespace-pre-wrap break-words text-[11px] text-paper">
{r.params ? JSON.stringify(r.params, null, 2) : "(no params recorded)"}
      </pre>

      <h3 className="mt-5 mb-2 text-[10px] uppercase tracking-wider text-dim">Outcome</h3>
      <div className="text-paper">
        {r.outcome === "committed" && <span className="text-[#6fa86a]">✓ committed</span>}
        {r.outcome === "rejected"  && <span className="text-scream">✗ {r.errorCode} <span className="text-dim">({r.errorPhase})</span></span>}
        {r.outcome === "idle"      && <span className="text-dim">idle</span>}
      </div>
    </aside>
  );
}
```

### Step 3: Mount `TxPanel` in `CityStage.tsx`

Add `import TxPanel from "./TxPanel";` and include `<TxPanel />` in the return block next to `<AgentPanel />`.

### Step 4: Commit

```bash
git add apps/web/src/phaser/amount-popup.ts apps/web/src/phaser/scenes/CityScene.ts apps/web/src/components/TxPanel.tsx apps/web/src/components/CityStage.tsx
git commit -m "feat(web): clickable commit popups → TxPanel with params + outcome"
```

---

## Task 16: First-load / zero-state UX

**Files:**
- Modify: `apps/web/src/components/CityStage.tsx` (loading + "waiting for first tick" hint)

### Step 1: Add two small UX affordances

Update `CityStage.tsx` to:
- Show a "connecting…" overlay while snapshot is pending
- If the snapshot loaded but no events have arrived within ~20s, show a subtle hint that a tick should happen any moment (helps devs not mistake "quiet" for "broken")

Replace the body with:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { bootPhaser } from "../phaser/boot";
import { fetchSnapshot } from "../lib/snapshot";
import { connectEventStream } from "../lib/event-stream";
import { useCityStore } from "../state/city-store";
import HudTopBar from "./HudTopBar";
import AgentCard from "./AgentCard";
import AgentPanel from "./AgentPanel";
import TxPanel from "./TxPanel";
import type Phaser from "phaser";

export default function CityStage() {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "quiet" | "error">("connecting");

  useEffect(() => {
    if (!parentRef.current) return;
    gameRef.current = bootPhaser(parentRef.current);

    (async () => {
      try {
        const snap = await fetchSnapshot();
        useCityStore.getState().hydrate({
          agents: snap.agents.map((a) => ({ ...a, x: 0, y: 0 })),
          recent: snap.recent
        });
        setStatus(snap.recent.length > 0 ? "live" : "quiet");
      } catch (e) {
        console.warn("snapshot unavailable", e);
        setStatus("error");
      }
    })();

    const stream = connectEventStream((e) => {
      useCityStore.getState().applyEvent(e);
      setStatus("live");
    });

    return () => {
      stream.close();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-ink">
      <div ref={parentRef} className="flex min-h-screen items-center justify-center" />
      <HudTopBar />
      <AgentCard />
      <AgentPanel />
      <TxPanel />
      {status === "connecting" && (
        <Overlay>Connecting to the city…</Overlay>
      )}
      {status === "error" && (
        <Overlay>Snapshot unavailable. Is <code className="text-scream">pnpm city:start</code> running?</Overlay>
      )}
      {status === "quiet" && (
        <Overlay subtle>Waiting for the first agent tick…</Overlay>
      )}
    </div>
  );
}

function Overlay({ children, subtle }: { children: React.ReactNode; subtle?: boolean }) {
  return (
    <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[11px] px-3 py-1.5 rounded-sm ${subtle ? "text-dim bg-transparent" : "text-paper bg-ink border border-mute"}`}>
      {children}
    </div>
  );
}
```

### Step 2: Commit

```bash
git add apps/web/src/components/CityStage.tsx
git commit -m "feat(web): zero-state UX — connecting / error / waiting overlays"
```

---

## Task 17: Integration smoke — visual demo run (manual)

**Goal:** open the city and watch it live for 2 minutes. Human-verifiable.

- [ ] **Step 1: Clean slate + build**

```bash
pnpm ledger:down && rm -rf data/postgres data/orchestrator.sqlite
pnpm ledger:up
pnpm --filter @nac/template-engine build
pnpm --filter @nac/orchestrator build
pnpm seed-genesis
```

- [ ] **Step 2: Boot the backend with DEMO_MODE on, so ticks happen every 20-40s**

```bash
DEMO_MODE=1 ANTHROPIC_API_KEY=sk-ant-... pnpm city:start
```

Expect the banner to include all three lines: event bus, http, ledger.

- [ ] **Step 3: In another terminal, boot the front end**

```bash
pnpm web:dev
```

Open http://localhost:3000.

- [ ] **Step 4: Watch for ~2 minutes. Acceptance:**

- All 10 agent sprites visible, each a distinct color, walking around the tile map
- HUD top-bar populated: `in circulation`, `ticks`, `rejected`, `uptime`
- Within 60s: at least one coin-flow trail appears between two agents + a green `✓ template_id` popup **OR** a red barrier flash with an error code
- Hover an agent → profile card appears with name, role, balance
- Click an agent → right-side panel opens with the intent log
- Click a commit popup (catch one before it fades, ~1.8s) → left-side panel with params + outcome
- No uncaught errors in the browser console
- No uncaught exceptions in the `city:start` log

- [ ] **Step 5: Capture a screenshot** and drop it in `apps/web/public/demo/first-run.png` as evidence. (`Cmd+Shift+4` on macOS.)

- [ ] **Step 6: Commit the screenshot**

```bash
git add apps/web/public/demo/first-run.png
git commit -m "docs(web): screenshot of the running city (Plan 3 smoke evidence)"
```

---

## Task 18: README update + release gates

**Files:**
- Modify: `README.md`, `apps/web/README.md`

- [ ] **Step 1: Append a Plan 3 section to the root `README.md`** (after the Plan 2 section):

```markdown
## Plan 3 — Visual City

The pixel village.

    export ANTHROPIC_API_KEY=sk-ant-...
    pnpm ledger:up
    pnpm seed-genesis
    pnpm --filter @nac/template-engine build
    pnpm --filter @nac/orchestrator build
    DEMO_MODE=1 pnpm city:start     # terminal A
    pnpm web:dev                    # terminal B

Then open http://localhost:3000. You'll see ten colored agents walking a tile-mapped town, coin-flow particles between counterparties on commits, and color-coded barrier flashes on rejections (vermillion = authorization, blue = schema/validate, deep red = ledger commit, gray = other). Hover an agent → profile card. Click an agent → intent log. Click a `✓ template_id` popup → transaction detail.

### What the front-end adds on top of Plan 2

- **`apps/web/`** — Next.js 15 / Phaser 3 / Tailwind / Zustand
- **`packages/orchestrator/src/http.ts`** — HTTP `/snapshot` for initial state + `DEMO_MODE` fast ticks
- **Kenney CC0 assets** under `apps/web/public/assets/`

### Not yet (coming in Plan 4)

- Arena: visitor-driven prompt injection against agents
- Shareable webm capture of rejected attacks
- OG images for rejection permalinks
```

- [ ] **Step 2: Write a minimal `apps/web/README.md`**

```markdown
# @nac/web — Numscript Agent City front-end

Next.js 15 app that renders the Plan-2 agent economy as a pixel village.

## Dev

    pnpm install
    pnpm --filter @nac/web dev

Requires the orchestrator running on `ws://127.0.0.1:3070` (WebSocket) and
`http://127.0.0.1:3071` (snapshot). Env:

- `NEXT_PUBLIC_CITY_WS_URL`   (default `ws://127.0.0.1:3070`)
- `NEXT_PUBLIC_CITY_HTTP_URL` (default `http://127.0.0.1:3071`)

## Architecture

- `src/phaser/` — canvas / sprites / particles / barrier animations
- `src/components/` — HUD, hover card, slide-in panels (Tailwind)
- `src/state/city-store.ts` — Zustand store, single source of truth
- `src/lib/snapshot.ts` + `event-stream.ts` — boot sequence (HTTP snapshot → WebSocket deltas)
- `public/assets/` — Kenney CC0 sprites

## Release gates

- `pnpm web:build` passes
- `pnpm lint` in the web package passes
- Manual smoke: 10 agents visible, ≥1 coin flow or barrier within 60s, no console errors
```

- [ ] **Step 3: Verify release gates**

All must pass:

```bash
pnpm --filter @nac/web lint                # no errors
pnpm --filter @nac/web build               # build succeeds
pnpm --filter @nac/orchestrator test       # 38+ tests pass (new http.test.ts adds 3 → 41 total)
pnpm --filter @nac/template-engine test    # no regression
```

- [ ] **Step 4: Commit**

```bash
git add README.md apps/web/README.md
git commit -m "docs: README — Plan 3 visual city overview + release gates"
```

---

## Release-gate recap (Plan 3)

1. `pnpm --filter @nac/web build` succeeds with no TypeScript errors
2. `pnpm --filter @nac/web lint` clean
3. `pnpm --filter @nac/orchestrator test` — new http tests included, all pass
4. Manual visual smoke per Task 17: 10 sprites visible, at least one coin-flow or barrier event within 60s, hover + click panels work, browser console clean
5. Plan 3 README section merged

## Self-review (done)

- **Spec coverage:** § 6.1 City (pixel village, agent sprites, 5-6 buildings, coin-flow particles, floating amount popups, random-walk movement, HUD, hover card, click profile, ledger explorer — all Tasks 3-15 directly) · § 6.2 Arena explicitly deferred to Plan 4 · § 6.3 embedded ledger explorer is partially addressed (TxPanel shows params + outcome; the full filter-by-template UI is a Plan 3.1 follow-up and called out in the README).
- **Placeholder scan:** no "TBD", "TODO", or "similar to Task N" — every code step shows actual code.
- **Type consistency:** `CityEvent` the discriminated UI type (Task 5) matches the orchestrator's structural `CityEvent` one-for-one on `kind`; the `data` narrowing is strictly additive. `AgentView.balance` (number, minor units) is the same convention used on the backend. `HUDTopBar` reads balances via `agents[*].balance`, same key written by `city-store.hydrate`. `AgentSprite.worldX/worldY` are the same coordinates `CityScene.animateForEntry` passes to `emitCoins`/`floatPopup`/`showBarrier`.
- **Dependency order:** http endpoint (Task 1) → demo mode (2) → web scaffold (3) → assets (4) → schema (5) → store (6) → snapshot (7) → ws (8) → phaser boot (9) → sprites (10) → particles (11) → stage (12) → HUD (13) → agent UI (14) → tx UI (15) → zero-state (16) → smoke (17) → README (18). Each task compiles and runs independently after the one before.

## Notes for Plan 4 (Arena & Share)

- The `/snapshot` HTTP endpoint is a good place to add a `POST /arena` endpoint in Plan 4 — visitor prompts submitted to it, the orchestrator queues them as a "next-tick override" for the target agent.
- A new `CityEvent` kind `"arena-attempt"` will let the front end distinguish Judy's autonomous probes from a visitor's submission — purely additive to the discriminated union in `event-schema.ts`.
- Webm capture (Plan 4) hooks into the same canvas `CityStage` mounts — use `canvas.captureStream()` on the Phaser `WEBGL` canvas + `MediaRecorder` to the webm blob. The HUD becomes the overlay recorded over the canvas via `html2canvas`-style snapshotting OR by rendering HUD text into Phaser directly.
- The `TxPanel` and `AgentPanel` are already wired for permalinks — add `/attacks/{id}` and `/agents/{id}` routes that pre-open the relevant panel on load, and you get shareable deep-links for free.

