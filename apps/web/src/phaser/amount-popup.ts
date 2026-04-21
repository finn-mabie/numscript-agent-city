import Phaser from "phaser";

export function floatPopup(
  scene: Phaser.Scene,
  x: number, y: number,
  text: string,
  color: string = "#6fa86a"
): void {
  const t = scene.add.text(x, y, text, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "7px",
    color
  }).setOrigin(0.5, 1);

  scene.tweens.add({
    targets: t,
    y: y - 20,
    alpha: 0,
    duration: 1200,
    ease: "cubic.out",
    onComplete: () => t.destroy()
  });
}

/** Clickable version — lingers longer so users can catch the pointer. Task 15 uses this. */
export function floatPopupClickable(
  scene: Phaser.Scene,
  x: number, y: number,
  text: string,
  color: string,
  onClick: () => void
): void {
  const t = scene.add.text(x, y, text, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "7px",
    color
  }).setOrigin(0.5, 1);
  t.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);

  scene.tweens.add({
    targets: t,
    y: y - 20,
    alpha: 0,
    duration: 1800,
    ease: "cubic.out",
    onComplete: () => t.destroy()
  });
}
