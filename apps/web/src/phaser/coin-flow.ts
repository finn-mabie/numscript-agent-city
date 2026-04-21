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
    const dot = scene.add.circle(x1, y1, 1.5, 0xf0c457);
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
