import Phaser from "phaser";
import { TILE, GRID_W, GRID_H } from "./scenes/CityScene";
import { ANCHORED_IDS, type AgentView } from "../state/city-store";

// How strongly the random walk biases back toward the agent's home tile.
// 0 = pure random walk; 1 = always step toward home. 0.35 gives a light drift
// that keeps agents loose around their building without feeling caged.
const HOME_BIAS = 0.35;
// Max tiles an agent can wander from home before the walk forces a return.
const HOME_RADIUS = 4;

export class AgentSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private tx: number;
  private ty: number;
  private readonly home: { tx: number; ty: number };

  constructor(scene: Phaser.Scene, public readonly agent: AgentView) {
    this.tx = agent.x;
    this.ty = agent.y;
    this.home = { tx: agent.x, ty: agent.y };
    this.sprite = scene.add.sprite(this.px(), this.py(), "chars", 84) // char frame 84 = default humanoid
      .setDisplaySize(TILE, TILE)
      .setTint(this.hexToNumber(agent.color));
    this.label = scene.add.text(this.px(), this.py() - TILE * 0.75, agent.name, {
      fontFamily: "ui-monospace, monospace",
      fontSize: "9px",
      color: "#ede8df"
    }).setOrigin(0.5, 1).setResolution(3);

    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on("pointerover", (pointer: Phaser.Input.Pointer) => {
      // Use the raw DOM event's clientX/Y — gives exact screen coords
      // regardless of canvas zoom / centering. HTML hover card lands correctly.
      const ev = pointer.event as MouseEvent;
      window.dispatchEvent(new CustomEvent("nac:agent-hover", {
        detail: { id: agent.id, x: ev.clientX, y: ev.clientY }
      }));
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
    // Anchored agents stand at their post (Alice runs the Market, Dave the
    // Bank, etc.) — only freelancers wander.
    if (ANCHORED_IDS.has(this.agent.id)) return;

    // Distance from home — if we've drifted too far, force a step back.
    const distH = Math.max(Math.abs(this.tx - this.home.tx), Math.abs(this.ty - this.home.ty));
    const mustReturn = distH >= HOME_RADIUS;

    let dx: number, dy: number;
    if (mustReturn || Math.random() < HOME_BIAS) {
      // Step toward home.
      dx = Math.sign(this.home.tx - this.tx);
      dy = Math.sign(this.home.ty - this.ty);
      // If already at home tile, do a pure random step so we don't freeze.
      if (dx === 0 && dy === 0) {
        dx = Phaser.Math.Between(-1, 1);
        dy = Phaser.Math.Between(-1, 1);
      }
    } else {
      dx = Phaser.Math.Between(-1, 1);
      dy = Phaser.Math.Between(-1, 1);
    }
    const nx = Phaser.Math.Clamp(this.tx + dx, 0, GRID_W - 1);
    const ny = Phaser.Math.Clamp(this.ty + dy, 0, GRID_H - 1);
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
