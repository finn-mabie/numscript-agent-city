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

  create() {
    this.cameras.main.setBackgroundColor("#1a2f1a");
    this.buildGround();
    this.buildBuildings();

    const initial = useCityStore.getState().agents;
    for (const a of Object.values(initial)) this.spawn(a);

    // React to hydrations that happen AFTER create (common — snapshot fetch
    // resolves after Phaser mounts).
    const seenTickIds = new Set<string>();
    useCityStore.subscribe((s) => {
      for (const a of Object.values(s.agents)) {
        if (!this.agents.has(a.id)) this.spawn(a);
      }
      // Animate any new recent entries (newest-first, so break once we hit a seen one).
      for (const r of s.recent) {
        if (seenTickIds.has(r.tickId)) break;
        seenTickIds.add(r.tickId);
        this.animateForEntry(r);
      }
    });
  }

  private spawn(a: import("../../state/city-store").AgentView): void {
    this.agents.set(a.id, new AgentSprite(this, a));
  }

  private animateForEntry(r: { agentId: string; outcome: string; templateId: string | null; errorPhase: string | null; errorCode: string | null; tickId: string; params: Record<string, unknown> | null }): void {
    const src = this.agents.get(r.agentId);
    if (!src) return;

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
    // outcome "idle" produces no visual
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
    // Six buildings at fixed tile coords. Tile indices point into Tiny Town's
    // packed tilemap; these are approximate "house" frames. If any look wrong,
    // tweak the `tile:` values — the packed sheet has a 12-col grid.
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
