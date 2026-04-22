import Phaser from "phaser";

export type BarrierKind =
  | "schema"
  | "overdraft"
  | "unknown-template"
  | "idempotency"
  | "authorization"
  | "other";

/**
 * Pick the barrier variant from a raw event (phase + code). Keeps the event
 * schema unchanged — the code here is the only place that knows which
 * (phase, code) pairs map to which visual.
 */
export function barrierKindFor(phase: string | null, code: string | null): BarrierKind {
  if (phase === "validate") return "schema";
  if (code === "MissingFundsErr" || code === "INSUFFICIENT_FUNDS") return "overdraft";
  if (code === "UnknownTemplate" || code === "TemplateNotFound") return "unknown-template";
  if (code === "IdempotencyReplay" || code === "ReferenceExists" || code === "DUPLICATE_REFERENCE") return "idempotency";
  if (phase === "authorization") return "authorization";
  return "other";
}

export function showBarrier(
  scene: Phaser.Scene,
  x: number, y: number,
  kind: BarrierKind,
  code: string
): void {
  switch (kind) {
    case "schema":           return drawSchemaShield(scene, x, y, code);
    case "overdraft":        return drawOverdraftCross(scene, x, y, code);
    case "unknown-template": return drawUnknownStamp(scene, x, y, code);
    case "idempotency":      return drawIdempotencyStamp(scene, x, y, code);
    case "authorization":    return drawAuthRing(scene, x, y, code);
    case "other":            return drawGenericRing(scene, x, y, code);
  }
}

// ── Variants ───────────────────────────────────────────────────────────────

function drawSchemaShield(s: Phaser.Scene, x: number, y: number, code: string): void {
  const color = 0x4fa89f;
  const hex = new Phaser.Geom.Polygon(hexPoints(x, y, 14));
  const g = s.add.graphics();
  g.fillStyle(color, 0.22);
  g.fillPoints(hex.points, true);
  g.lineStyle(1.5, color, 1);
  g.strokePoints(hex.points, true);
  fadeAndDestroy(s, g, 1200);
  floatStamp(s, x, y + 14, code, "#4fa89f");
}

function drawOverdraftCross(s: Phaser.Scene, x: number, y: number, code: string): void {
  const color = 0xec3a2d;
  const ring = s.add.circle(x, y, 3, color, 0).setStrokeStyle(2, color);
  s.tweens.add({ targets: ring, radius: 14, duration: 280, ease: "cubic.out" });
  const slash = s.add.line(x, y, -10, -10, 10, 10, color).setLineWidth(2);
  slash.setOrigin(0.5, 0.5);
  fadeAndDestroy(s, ring, 1200);
  fadeAndDestroy(s, slash, 1200);
  floatStamp(s, x, y + 16, code, "#ec3a2d");
}

function drawUnknownStamp(s: Phaser.Scene, x: number, y: number, code: string): void {
  const box = s.add.rectangle(x, y, 34, 14, 0x222222).setStrokeStyle(1, 0xede8df);
  const label = s.add.text(x, y, "404 TEMPLATE", {
    fontFamily: "ui-monospace, monospace",
    fontSize: "8px",
    color: "#ede8df",
    fontStyle: "700"
  }).setOrigin(0.5, 0.5).setResolution(4);
  box.setAlpha(0); label.setAlpha(0);
  s.tweens.add({ targets: [box, label], alpha: 1, duration: 120, ease: "cubic.out" });
  s.tweens.add({
    targets: [box, label],
    alpha: 0, y: y - 10,
    delay: 900, duration: 500, ease: "cubic.in",
    onComplete: () => { box.destroy(); label.destroy(); }
  });
  floatStamp(s, x, y + 16, code, "#ede8df");
}

function drawIdempotencyStamp(s: Phaser.Scene, x: number, y: number, code: string): void {
  const box = s.add.rectangle(x, y, 52, 14, 0x4a3c54).setStrokeStyle(1, 0xede8df);
  const label = s.add.text(x, y, "ALREADY SEEN", {
    fontFamily: "ui-monospace, monospace",
    fontSize: "8px",
    color: "#ede8df",
    fontStyle: "700"
  }).setOrigin(0.5, 0.5).setResolution(4);
  box.setAlpha(0); label.setAlpha(0);
  s.tweens.add({ targets: [box, label], alpha: 1, duration: 120, ease: "cubic.out" });
  s.tweens.add({
    targets: [box, label],
    alpha: 0,
    delay: 1000, duration: 500, ease: "cubic.in",
    onComplete: () => { box.destroy(); label.destroy(); }
  });
  floatStamp(s, x, y + 16, code, "#ede8df");
}

function drawAuthRing(s: Phaser.Scene, x: number, y: number, code: string): void {
  const color = 0xec3a2d;
  const ring = s.add.circle(x, y, 3, color, 0).setStrokeStyle(2, color);
  s.tweens.add({ targets: ring, radius: 20, alpha: 0, duration: 1000, ease: "cubic.out", onComplete: () => ring.destroy() });
  floatStamp(s, x, y + 16, code, "#ec3a2d");
}

function drawGenericRing(s: Phaser.Scene, x: number, y: number, code: string): void {
  const color = 0x888888;
  const ring = s.add.circle(x, y, 3, color, 0).setStrokeStyle(2, color);
  s.tweens.add({ targets: ring, radius: 18, alpha: 0, duration: 900, ease: "cubic.out", onComplete: () => ring.destroy() });
  floatStamp(s, x, y + 14, code, "#cccccc");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function hexPoints(cx: number, cy: number, r: number): Phaser.Geom.Point[] {
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * Math.PI * 2 - Math.PI / 2;
    pts.push(new Phaser.Geom.Point(cx + Math.cos(th) * r, cy + Math.sin(th) * r));
  }
  return pts;
}

function fadeAndDestroy(s: Phaser.Scene, obj: Phaser.GameObjects.GameObject, duration: number): void {
  s.tweens.add({
    targets: obj,
    alpha: 0,
    duration,
    ease: "cubic.out",
    onComplete: () => obj.destroy()
  });
}

function floatStamp(s: Phaser.Scene, x: number, y: number, text: string, color: string): void {
  const label = s.add.text(x, y, text, {
    fontFamily: "ui-monospace, monospace",
    fontSize: "10px",
    color,
    fontStyle: "700"
  }).setOrigin(0.5, 0).setResolution(4);
  s.tweens.add({
    targets: label,
    y: y + 20,
    alpha: 0,
    duration: 1400,
    ease: "cubic.out",
    onComplete: () => label.destroy()
  });
}
