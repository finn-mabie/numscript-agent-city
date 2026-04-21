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
      fontSize: "6px",
      color: "#ede8df",
      backgroundColor: "#3a3732",
      padding: { left: 2, right: 2, top: 1, bottom: 1 }
    }).setOrigin(0.5, 1).setAlpha(0);
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
        const m = v.match(/^@agents:([0-9]+):.+$/);
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
    // Six building landmarks rendered as design-system rectangles (mute fill,
    // paper 1px border). Matches the "financial data-room meets pixel village"
    // direction — buildings read as intentional plates instead of random
    // tileset tiles. Spaced across a 20x12 grid so labels don't collide.
    const defs: Array<{ tx: number; ty: number; label: string }> = [
      { tx:  2, ty:  1, label: "Market" },
      { tx:  7, ty:  1, label: "Bank" },
      { tx: 12, ty:  1, label: "Post Office" },
      { tx: 17, ty:  1, label: "Inspector" },
      { tx:  5, ty:  9, label: "Pool" },
      { tx: 14, ty:  9, label: "Escrow" }
    ];
    const W = TILE * 2.5;
    const H = TILE * 1.6;
    for (const d of defs) {
      const cx = d.tx * TILE + TILE;
      const cy = d.ty * TILE + TILE;
      this.add.rectangle(cx, cy, W, H, 0x3a3732)   // --mute
        .setStrokeStyle(1, 0xede8df);              // --paper
      // Small pixel window for texture
      this.add.rectangle(cx, cy - 1, W * 0.5, 2, 0x6e6a62); // --dim
      this.add.text(cx, cy - H / 2 - 2, d.label, {
        fontFamily: "ui-monospace, monospace",
        fontSize: "7px",
        color: "#ede8df"
      }).setOrigin(0.5, 1);
    }
  }
}
