import Phaser from "phaser";
import { TILE, GRID_W, GRID_H } from "./scenes/CityScene";
import type { AgentView } from "../state/city-store";

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
      targets: this.sprite,
      x: this.px(),
      y: this.py(),
      duration: 400,
      ease: "sine.inOut"
    });
    scene.tweens.add({
      targets: this.label,
      x: this.px(),
      y: this.py() - TILE * 0.75,
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
