import Phaser from "phaser";
import { useCityStore } from "../../state/city-store";
import { AgentSprite } from "../agent-sprite";

export const TILE = 16;
export const GRID_W = 20;
export const GRID_H = 12;

export class CityScene extends Phaser.Scene {
  private agents = new Map<string, AgentSprite>();

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

    const initial = useCityStore.getState().agents;
    for (const a of Object.values(initial)) this.spawn(a);

    // React to hydrations that happen AFTER create (common — snapshot fetch
    // resolves after Phaser mounts).
    useCityStore.subscribe((s) => {
      for (const a of Object.values(s.agents)) {
        if (!this.agents.has(a.id)) this.spawn(a);
      }
    });
  }

  private spawn(a: import("../../state/city-store").AgentView): void {
    this.agents.set(a.id, new AgentSprite(this, a));
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
