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

  const ring = scene.add.circle(x, y, 3, color, 0).setStrokeStyle(2, color);
  scene.tweens.add({
    targets: ring,
    radius: 18,
    alpha: 0,
    duration: 900,
    ease: "cubic.out",
    onComplete: () => ring.destroy()
  });

  const label = scene.add.text(x, y + 4, code, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "10px",
    color: "#ec3a2d",
    fontStyle: "bold"
  }).setOrigin(0.5, 0).setResolution(4);
  scene.tweens.add({
    targets: label,
    y: y + 24,
    alpha: 0,
    duration: 1400,
    ease: "cubic.out",
    onComplete: () => label.destroy()
  });
}
