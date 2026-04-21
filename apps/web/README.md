# @nac/web — Numscript Agent City front-end

Next.js 15 + Phaser 3 + Tailwind. Renders the Plan-2 agent economy as a pixel village.

## Dev

    pnpm install
    pnpm --filter @nac/web dev

Requires the orchestrator on ws://127.0.0.1:3070 (WebSocket) and http://127.0.0.1:3071 (snapshot).

## Design tokens

All colors live as CSS vars in `src/app/globals.css`. Tailwind references them via `var()` so classes
stay composable. Typography is JetBrains Mono only — no sans-serif in the chrome.
