import Phaser from "phaser";

export interface OfferBubbleHandle { destroy(): void; }

/**
 * Speech bubble above an agent when they post to the board. Gold border for
 * root posts, silver for replies. Lingers ~4s then fades.
 */
export function offerBubble(
  scene: Phaser.Scene,
  x: number, y: number,
  text: string,
  kind: "root" | "reply"
): OfferBubbleHandle {
  const borderColor = kind === "root" ? "#f0c457" : "#a8a8a8";
  const shown = text.length > 40 ? text.slice(0, 37).trimEnd() + "…" : text;
  const label = scene.add.text(x, y - 14, shown, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "9px",
    color: "#ede8df",
    backgroundColor: "#1a1916",
    padding: { left: 4, right: 4, top: 2, bottom: 2 },
    wordWrap: { width: 160 }
  }).setOrigin(0.5, 1).setAlpha(0).setResolution(4);
  // Manual border — Phaser text bg doesn't support stroke
  const bounds = label.getBounds();
  const border = scene.add.rectangle(
    bounds.x + bounds.width / 2, bounds.y + bounds.height / 2,
    bounds.width + 2, bounds.height + 2,
    0x000000, 0
  ).setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(borderColor).color).setAlpha(0);
  scene.tweens.add({ targets: [label, border], alpha: 1, duration: 180, ease: "cubic.out" });
  const timer = scene.time.delayedCall(4000, () => {
    scene.tweens.add({
      targets: [label, border], alpha: 0, duration: 240,
      onComplete: () => { label.destroy(); border.destroy(); }
    });
  });
  return {
    destroy() {
      timer.remove(false);
      if (label.active) label.destroy();
      if (border.active) border.destroy();
    }
  };
}

/**
 * Thin gold line between two sprite coordinates, ~800ms fade-out.
 * Pure decoration for the moment a reply lands.
 */
export function threadConnector(
  scene: Phaser.Scene,
  fromX: number, fromY: number,
  toX: number, toY: number
): void {
  const g = scene.add.graphics();
  g.lineStyle(1, 0xf0c457, 0.8);
  g.lineBetween(fromX, fromY, toX, toY);
  scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: 800,
    ease: "cubic.in",
    onComplete: () => g.destroy()
  });
}
