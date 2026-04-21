import Phaser from "phaser";

export type BarrierKind = "authorization" | "validate" | "commit" | "load" | "other";

/**
 * Show a brief animated shield + label at (x,y). Each rejection phase gets its
 * own visual so a watcher learns which guard caught which kind of attempt.
 */
export function showBarrier(scene: Phaser.Scene, x: number, y: number, kind: BarrierKind, code: string): void {
  const color =
    kind === "authorization" ? 0xec3a2d :    // --scream
    kind === "validate"      ? 0x4a90e2 :    // blue (schema)
    kind === "commit"        ? 0xb22222 :    // deep red (ledger)
    0x888888;                                // gray (other)

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
    color: "#ec3a2d"
  }).setOrigin(0.5, 0);
  scene.tweens.add({
    targets: label,
    y: y + 14,
    alpha: 0,
    duration: 900,
    onComplete: () => label.destroy()
  });
}
