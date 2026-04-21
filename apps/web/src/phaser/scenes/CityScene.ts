import Phaser from "phaser";
import { useCityStore } from "../../state/city-store";
import { AgentSprite } from "../agent-sprite";
import { emitCoins } from "../coin-flow";
import { floatPopup, floatPopupClickable } from "../amount-popup";
import { showBarrier, type BarrierKind } from "../barrier";

export const TILE = 16;
export const GRID_W = 20;
export const GRID_H = 12;

export class CityScene extends Phaser.Scene {
  private agents = new Map<string, AgentSprite>();

  constructor() { super({ key: "city" }); }

  preload() {
    this.load.spritesheet("tiles", "/assets/tiny-town/tilemap_packed.png", {
      frameWidth: 16, frameHeight: 16
    });
    this.load.spritesheet("chars", "/assets/characters/tiny-characters.png", {
      frameWidth: 16, frameHeight: 16
    });
  }

  // Thought bubbles for pending intents, keyed by tickId. Cleared when the
  // terminal outcome (committed / rejected / idle) arrives.
  private thinking = new Map<string, Phaser.GameObjects.GameObject[]>();

  create() {
    this.cameras.main.setBackgroundColor("#1a2f1a");
    this.buildGround();
    this.buildBuildings();

    const initial = useCityStore.getState().agents;
    for (const a of Object.values(initial)) this.spawn(a);

    // Subscribe with BOTH current and previous state so we can detect
    // pending → terminal transitions and animate each step.
    useCityStore.subscribe((s, prev) => {
      for (const a of Object.values(s.agents)) {
        if (!this.agents.has(a.id)) this.spawn(a);
      }
      // For each recent entry, compare to its prior outcome (if any) and
      // animate only on changes. This handles both "fresh intent" and
      // "pending → commit/reject" transitions cleanly.
      for (const r of s.recent) {
        const prior = prev?.recent.find((x) => x.tickId === r.tickId);
        if (prior?.outcome === r.outcome) continue;
        this.animateForEntry(r, prior?.outcome);
      }
    });
  }

  private spawn(a: import("../../state/city-store").AgentView): void {
    this.agents.set(a.id, new AgentSprite(this, a));
  }

  private animateForEntry(
    r: { agentId: string; outcome: string; templateId: string | null; errorPhase: string | null; errorCode: string | null; tickId: string; params: Record<string, unknown> | null },
    priorOutcome?: string
  ): void {
    const src = this.agents.get(r.agentId);
    if (!src) return;

    // Pending → show thinking bubble
    if (r.outcome === "pending") {
      this.showThinkingBubble(src, r.tickId, r.templateId ?? "…");
      return;
    }

    // Leaving pending → clear bubble before outcome animation
    if (priorOutcome === "pending" || this.thinking.has(r.tickId)) {
      this.clearThinkingBubble(r.tickId);
    }

    if (r.outcome === "committed") {
      const peerId = this.counterpartyFromParams(r.params);
      const dst = peerId ? this.agents.get(peerId) : undefined;
      if (dst) emitCoins(this, src.worldX(), src.worldY(), dst.worldX(), dst.worldY(), 700);
      floatPopupClickable(
        this,
        src.worldX(), src.worldY() - 8,
        `✓ ${r.templateId}`,
        "#6fa86a",
        () => window.dispatchEvent(new CustomEvent("nac:tx-click", { detail: { tickId: r.tickId } }))
      );
    } else if (r.outcome === "rejected") {
      const kind: BarrierKind =
        r.errorPhase === "authorization" ? "authorization" :
        r.errorPhase === "validate"      ? "validate" :
        r.errorPhase === "commit"        ? "commit" :
        r.errorPhase === "load"          ? "load" : "other";
      showBarrier(this, src.worldX(), src.worldY(), kind, r.errorCode ?? "REJECTED");
    }
    // outcome "idle" produces no visual (bubble was already cleared above)
  }

  private showThinkingBubble(src: AgentSprite, tickId: string, templateId: string): void {
    // A small quote-mark + template name above the agent. Lives until the
    // terminal outcome replaces it (or as a safety, ~8s timeout).
    const x = src.worldX();
    const y = src.worldY() - 11;
    const label = this.add.text(x, y, `⋯ ${templateId}`, {
      fontFamily: "ui-monospace, monospace",
      fontSize: "9px",
      color: "#ede8df",
      backgroundColor: "#3a3732",
      padding: { left: 4, right: 4, top: 2, bottom: 2 }
    }).setOrigin(0.5, 1).setAlpha(0).setResolution(4);
    this.tweens.add({ targets: label, alpha: 1, duration: 180, ease: "cubic.out" });
    this.thinking.set(tickId, [label]);
    // Safety timeout — clear if no terminal event arrives in 8s.
    this.time.delayedCall(8000, () => this.clearThinkingBubble(tickId));
  }

  private clearThinkingBubble(tickId: string): void {
    const objs = this.thinking.get(tickId);
    if (!objs) return;
    this.thinking.delete(tickId);
    for (const o of objs) {
      this.tweens.add({
        targets: o,
        alpha: 0,
        duration: 150,
        onComplete: () => o.destroy()
      });
    }
  }

  private counterpartyFromParams(params: Record<string, unknown> | null): string | null {
    if (!params) return null;
    for (const v of Object.values(params)) {
      if (typeof v === "string") {
        const m = v.match(/^@agents:([0-9]{3}):.+$/);
        if (m && m[1]) return m[1];
      }
    }
    return null;
  }

  private buildGround(): void {
    // Grass tile index (Kenney Tiny Town tilemap_packed.png). Tile 0 is grass
    // in the top row. Render a GRID_W × GRID_H carpet.
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, "tiles", 0)
          .setDisplaySize(TILE, TILE);
      }
    }
  }

  private buildBuildings(): void {
    // Six building landmarks. Each one has its OWN archetype drawn from
    // primitives — a market stall, a columned bank, a post-office box, an
    // inspector's kiosk, an actual pool of water, and a vault block.
    const defs: Array<{ tx: number; ty: number; label: string; draw: (scene: Phaser.Scene, cx: number, cy: number) => void }> = [
      { tx:  2, ty:  2, label: "Market",      draw: drawMarket      },
      { tx:  7, ty:  2, label: "Bank",        draw: drawBank        },
      { tx: 12, ty:  2, label: "Post Office", draw: drawPostOffice  },
      { tx: 17, ty:  2, label: "Inspector",   draw: drawInspector   },
      { tx:  5, ty: 10, label: "Pool",        draw: drawPool        },
      { tx: 14, ty: 10, label: "Escrow",      draw: drawEscrow      }
    ];

    for (const d of defs) {
      const cx = d.tx * TILE + TILE;
      const cy = d.ty * TILE + TILE * 0.6;  // building center pulled UP a bit so label fits above
      d.draw(this, cx, cy);
      this.add.text(cx, cy - TILE * 1.6, d.label, {
        fontFamily: "ui-monospace, monospace",
        fontSize: "13px",
        color: "#ede8df",
        fontStyle: "700"
      }).setOrigin(0.5, 1).setResolution(4);
    }
  }
}

// ── Per-building artwork ───────────────────────────────────────────────────
// All buildings draw within a ~40×36 footprint centered at (cx, cy).
// Design direction: each has a distinctive silhouette matching its purpose,
// warm neutrals only, no saturated primaries, crisp 1px outlines.

const OUTLINE = 0xede8df;

/** MARKET — open-air stall with striped awning, counter, and crates. */
function drawMarket(s: Phaser.Scene, cx: number, cy: number): void {
  const W = 40, postH = 12;
  // Sloped awning top (single triangle across full width — no floating crown)
  s.add.triangle(cx, cy - 9, -W/2, 3, 0, -5, W/2, 3, 0x5a3a22).setStrokeStyle(1, OUTLINE);
  // Striped awning band (3 stripes, each on its own rectangle, cleanly stacked)
  const stripes = [0xc69361, 0x9a6b47, 0xc69361];
  for (let i = 0; i < stripes.length; i++) {
    s.add.rectangle(cx, cy - 4 + i * 3, W, 3, stripes[i]).setStrokeStyle(1, OUTLINE);
  }
  // 2 support posts, anchored to the awning bottom and counter top
  s.add.rectangle(cx - W/2 + 3, cy + 3, 2, postH, 0x4f3c2b).setStrokeStyle(1, OUTLINE);
  s.add.rectangle(cx + W/2 - 3, cy + 3, 2, postH, 0x4f3c2b).setStrokeStyle(1, OUTLINE);
  // Counter (horizontal slab at bottom)
  s.add.rectangle(cx, cy + 9, W - 4, 4, 0x7a5c42).setStrokeStyle(1, OUTLINE);
  // Crates on the counter
  s.add.rectangle(cx - 8, cy + 6, 5, 5, 0x5a3a22).setStrokeStyle(1, OUTLINE);
  s.add.rectangle(cx,      cy + 6, 5, 5, 0x5a3a22).setStrokeStyle(1, OUTLINE);
  s.add.rectangle(cx + 8, cy + 6, 5, 5, 0x5a3a22).setStrokeStyle(1, OUTLINE);
}

/** BANK — greek temple: pediment triangle, columns, vault door. */
function drawBank(s: Phaser.Scene, cx: number, cy: number): void {
  const W = 34, bodyH = 18;
  // Pediment (top triangle)
  s.add.triangle(cx, cy - bodyH/2 - 1, -W/2 - 2, 0, 0, -9, W/2 + 2, 0, 0xbfa25d).setStrokeStyle(1, OUTLINE);
  // Entablature (thin horizontal band below pediment)
  s.add.rectangle(cx, cy - bodyH/2 + 1, W + 4, 2, 0x544529).setStrokeStyle(1, OUTLINE);
  // Base platform (step below body)
  s.add.rectangle(cx, cy + bodyH/2 + 1, W + 6, 3, 0x544529).setStrokeStyle(1, OUTLINE);
  // Three columns (between base and entablature)
  const colY = cy + 1;
  for (const dx of [-W * 0.35, 0, W * 0.35]) {
    s.add.rectangle(cx + dx, colY, 3, bodyH - 2, 0xd4b76f).setStrokeStyle(1, OUTLINE);
  }
  // Vault door in the center (dark circle behind columns)
  s.add.circle(cx, colY + 1, 4, 0x1f1a16).setStrokeStyle(1, OUTLINE);
  // Geometric "$" on the pediment: vertical bar + two short crossbars
  const dollarX = cx;
  const dollarY = cy - bodyH/2 - 4;
  s.add.rectangle(dollarX, dollarY,     1.5, 6, 0x3a2a10);  // vertical stroke
  s.add.rectangle(dollarX, dollarY - 2, 4,   1, 0x3a2a10);  // top bar
  s.add.rectangle(dollarX, dollarY + 2, 4,   1, 0x3a2a10);  // bottom bar
}

/** POST OFFICE — utility building with a mailbox slot, door, and sign. */
function drawPostOffice(s: Phaser.Scene, cx: number, cy: number): void {
  const W = 36, bodyH = 22;
  // Body (slate)
  s.add.rectangle(cx, cy, W, bodyH, 0x566874).setStrokeStyle(1, OUTLINE);
  // Flat roof trim
  s.add.rectangle(cx, cy - bodyH/2 - 1, W + 2, 2, 0x2d3942);
  // Sign board above the door
  s.add.rectangle(cx, cy - bodyH/2 + 4, W * 0.55, 4, 0x2d3942).setStrokeStyle(1, OUTLINE);
  s.add.text(cx, cy - bodyH/2 + 4, "POST", {
    fontFamily: "ui-monospace, monospace",
    fontSize: "5px",
    color: "#ede8df",
    fontStyle: "700"
  }).setOrigin(0.5, 0.5).setResolution(3);
  // Mail slot (horizontal dark rectangle on the door)
  s.add.rectangle(cx - W * 0.22, cy, 7, 2, 0x1a1a1a);
  // Envelope icon on the door
  s.add.rectangle(cx + W * 0.2, cy, 8, 6, 0xede8df).setStrokeStyle(1, 0x2d3942);
  s.add.triangle(cx + W * 0.2, cy - 1, -4, -2, 0, 1, 4, -2, 0xc0bdb4);
  // Door
  s.add.rectangle(cx - W * 0.08, cy + bodyH * 0.25, 5, bodyH * 0.4, 0x1f1a16).setStrokeStyle(1, 0x7b8d9a);
}

/** INSPECTOR — kiosk with a full-width flat-top roof, magnifying glass + clipboard. */
function drawInspector(s: Phaser.Scene, cx: number, cy: number): void {
  const W = 34, bodyH = 22;
  // Body (olive)
  s.add.rectangle(cx, cy, W, bodyH, 0x64714e).setStrokeStyle(1, OUTLINE);
  // Overhanging flat roof (slab wider than body)
  s.add.rectangle(cx, cy - bodyH/2 - 2, W + 6, 4, 0x37412a).setStrokeStyle(1, OUTLINE);
  // Thin trim line below the roof
  s.add.rectangle(cx, cy - bodyH/2 + 1, W, 1, 0x3a4128);
  // Counter window (wide, glazed)
  s.add.rectangle(cx, cy - 2, W - 8, 7, 0xc9ceb7).setStrokeStyle(1, 0x3a4128);
  // Counter shelf below window
  s.add.rectangle(cx, cy + 3, W - 6, 2, 0x3a4128);
  // Magnifying glass icon on the right side of the counter
  const mgX = cx + W * 0.3;
  const mgY = cy + bodyH * 0.22;
  s.add.circle(mgX, mgY, 3, 0x3a4128).setStrokeStyle(1, 0xede8df);
  s.add.circle(mgX, mgY, 2, 0xc9ceb7);
  s.add.rectangle(mgX + 3, mgY + 3, 4, 1.2, 0x3a4128);
  // Clipboard icon on the left side of the counter
  s.add.rectangle(cx - W * 0.32, cy + bodyH * 0.22, 5, 6, 0xede8df).setStrokeStyle(1, 0x3a4128);
  s.add.rectangle(cx - W * 0.32, cy + bodyH * 0.22 - 2.5, 2.5, 1, 0x3a4128);
}

/** POOL — actual pool of water with a deck border and ripples. */
function drawPool(s: Phaser.Scene, cx: number, cy: number): void {
  const W = 42, H = 24;
  // Deck border (outer)
  s.add.rectangle(cx, cy, W, H, 0x9a8f7a).setStrokeStyle(1, OUTLINE);
  // Water (inner)
  const wInner = W - 10, hInner = H - 8;
  s.add.rectangle(cx, cy, wInner, hInner, 0x4e9ba0).setStrokeStyle(1, 0x2a3c3e);
  // Darker inner shadow (gives depth)
  s.add.rectangle(cx, cy - 2, wInner - 4, 2, 0x2a6d72);
  // Ripples (wavy lines — use short rects offset to simulate)
  for (let i = 0; i < 3; i++) {
    const y = cy - hInner / 2 + 6 + i * 4;
    for (let x = -wInner / 2 + 4; x <= wInner / 2 - 4; x += 5) {
      s.add.rectangle(cx + x, y, 2, 1, 0x9ad2d6);
      s.add.rectangle(cx + x + 2.5, y + 1, 2, 1, 0x9ad2d6);
    }
  }
  // Diving board stub on one side
  s.add.rectangle(cx - W / 2 - 2, cy - H / 4, 5, 2, 0xc0b8a5).setStrokeStyle(1, OUTLINE);
}

/** ESCROW VAULT — monolithic block with a circular vault door and bolts. */
function drawEscrow(s: Phaser.Scene, cx: number, cy: number): void {
  const W = 38, H = 28;
  // Outer block (thick wall shade)
  s.add.rectangle(cx, cy, W, H, 0x4a3c54).setStrokeStyle(1, OUTLINE);
  // Inner chamber (slightly lighter)
  s.add.rectangle(cx, cy, W - 6, H - 6, 0x665272).setStrokeStyle(1, 0x362b3c);
  // Vault door — large central circle
  const r = 8;
  s.add.circle(cx, cy, r, 0x362b3c).setStrokeStyle(1, OUTLINE);
  s.add.circle(cx, cy, r - 2, 0x8a7599);
  // Center handle (small cross / plus)
  s.add.rectangle(cx, cy, 2, 6, 0x362b3c);
  s.add.rectangle(cx, cy, 6, 2, 0x362b3c);
  // 8 bolts around the door (octagonal pattern)
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2;
    const bx = cx + Math.cos(th) * (r + 2);
    const by = cy + Math.sin(th) * (r + 2);
    s.add.circle(bx, by, 1, 0xede8df);
  }
  // Corner rivets (structural cue)
  for (const [dx, dy] of [[-W/2+2, -H/2+2], [W/2-2, -H/2+2], [-W/2+2, H/2-2], [W/2-2, H/2-2]]) {
    s.add.circle(cx + dx, cy + dy, 1, 0xede8df);
  }
}
