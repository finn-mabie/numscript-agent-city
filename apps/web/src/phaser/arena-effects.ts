import Phaser from "phaser";

/**
 * Red outline pulse around a sprite's origin. Used the instant an arena
 * submit lands on a target, BEFORE the tick actually runs — primes the
 * viewer's eye on who is about to be attacked.
 */
export function incomingPulse(
  scene: Phaser.Scene,
  x: number, y: number
): void {
  const ring = scene.add.circle(x, y, 6, 0xec3a2d, 0).setStrokeStyle(2, 0xec3a2d);
  scene.tweens.add({
    targets: ring,
    radius: 22,
    alpha: 0,
    duration: 900,
    ease: "cubic.out",
    onComplete: () => ring.destroy()
  });
  // Double-pulse for emphasis
  scene.time.delayedCall(300, () => {
    const r2 = scene.add.circle(x, y, 6, 0xec3a2d, 0).setStrokeStyle(2, 0xec3a2d);
    scene.tweens.add({
      targets: r2,
      radius: 22,
      alpha: 0,
      duration: 900,
      ease: "cubic.out",
      onComplete: () => r2.destroy()
    });
  });
}

/**
 * Speech-bubble style label above the agent showing truncated visitor prompt.
 * Lingers for ~4 seconds — long enough to read but gone by the time the
 * barrier fires. Returns a handle so callers can force-clear it early.
 */
export interface BubbleHandle { destroy(): void; }

export function promptBubble(
  scene: Phaser.Scene,
  x: number, y: number,
  text: string
): BubbleHandle {
  // Trim to ~36 chars for the bubble; the full prompt is available in the HUD.
  const shown = text.length > 36 ? text.slice(0, 33).trimEnd() + "…" : text;
  const label = scene.add.text(x, y - 14, `"${shown}"`, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "9px",
    color: "#ede8df",
    backgroundColor: "#3a3732",
    padding: { left: 4, right: 4, top: 2, bottom: 2 },
    wordWrap: { width: 160 }
  }).setOrigin(0.5, 1).setAlpha(0).setResolution(4);
  scene.tweens.add({ targets: label, alpha: 1, duration: 180, ease: "cubic.out" });
  const timer = scene.time.delayedCall(4000, () => {
    scene.tweens.add({
      targets: label,
      alpha: 0,
      duration: 180,
      onComplete: () => label.destroy()
    });
  });
  return {
    destroy() {
      timer.remove(false);
      if (label.active) label.destroy();
    }
  };
}

/**
 * Dramatic "REJECTED" banner above the source building / agent when an arena
 * attack fails. Larger and louder than the per-template barrier glyph —
 * intended as the payoff frame for a 5-second recap.
 */
export function rejectedBanner(
  scene: Phaser.Scene,
  x: number, y: number
): void {
  const bg = scene.add.rectangle(x, y, 120, 20, 0xec3a2d).setStrokeStyle(1, 0xede8df).setOrigin(0.5, 0.5);
  const text = scene.add.text(x, y, "REJECTED", {
    fontFamily: "ui-monospace, monospace",
    fontSize: "11px",
    color: "#ede8df",
    fontStyle: "700"
  }).setOrigin(0.5, 0.5).setResolution(4);
  bg.setAlpha(0); text.setAlpha(0);
  scene.tweens.add({ targets: [bg, text], alpha: 1, duration: 160, ease: "cubic.out" });
  scene.tweens.add({
    targets: [bg, text],
    y: y - 14,
    alpha: 0,
    delay: 1400,
    duration: 600,
    ease: "cubic.in",
    onComplete: () => { bg.destroy(); text.destroy(); }
  });
  scene.cameras.main.shake(160, 0.0025);
}

/**
 * Coins travelling back from dst to src with a soft bounce-fade, to visualize
 * the "attack rebounded" moment. Thin wrapper so callers don't need to know
 * about the base coin-flow API.
 */
export function reverseCoinTrail(
  scene: Phaser.Scene,
  fromX: number, fromY: number,
  toX: number, toY: number
): void {
  // 3 coin dots, staggered, curving slightly.
  for (let i = 0; i < 3; i++) {
    const dot = scene.add.circle(fromX, fromY, 2, 0xf0c457).setStrokeStyle(1, 0x7a5c11);
    scene.tweens.add({
      targets: dot,
      x: toX,
      y: toY - 4,
      alpha: 0.2,
      delay: i * 80,
      duration: 520,
      ease: "cubic.in",
      onComplete: () => dot.destroy()
    });
  }
}
