import Phaser from "phaser";

/**
 * Thin magenta line from sender to recipient when a DM fires. Fades in over
 * 140ms, holds at full alpha ~500ms, fades out 500ms. Distinct from the
 * commit halo/delta — DMs move nothing, they're conversation.
 */
export function dmLine(
  scene: Phaser.Scene,
  fromX: number, fromY: number,
  toX: number, toY: number
): void {
  const line = scene.add.graphics();
  line.lineStyle(1.5, 0xc27ba0, 0.95);
  line.lineBetween(fromX, fromY, toX, toY);
  line.setAlpha(0);

  // Small arrowhead near the receiver end
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const headLen = 6;
  const head = scene.add.graphics();
  head.lineStyle(1.5, 0xc27ba0, 1);
  head.lineBetween(
    toX, toY,
    toX - headLen * Math.cos(angle - 0.45),
    toY - headLen * Math.sin(angle - 0.45)
  );
  head.lineBetween(
    toX, toY,
    toX - headLen * Math.cos(angle + 0.45),
    toY - headLen * Math.sin(angle + 0.45)
  );
  head.setAlpha(0);

  scene.tweens.add({
    targets: [line, head],
    alpha: 1,
    duration: 140,
    ease: "cubic.out",
  });
  scene.tweens.add({
    targets: [line, head],
    alpha: 0,
    delay: 640,
    duration: 500,
    ease: "cubic.in",
    onComplete: () => { line.destroy(); head.destroy(); },
  });
}
