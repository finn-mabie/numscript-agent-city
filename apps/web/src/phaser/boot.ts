import Phaser from "phaser";
import { CityScene, TILE, GRID_W, GRID_H } from "./scenes/CityScene";

/**
 * Pick the largest integer zoom that fits the current viewport.
 * Capped at 6 so pixels never get comically huge on ultrawide displays.
 */
function fitZoom(): number {
  if (typeof window === "undefined") return 4;
  const maxW = window.innerWidth - 60;      // margin for side panels / chrome
  const maxH = window.innerHeight - 120;    // margin for HUD top + ticker bottom
  const zW = Math.floor(maxW / (GRID_W * TILE));
  const zH = Math.floor(maxH / (GRID_H * TILE));
  return Math.max(2, Math.min(zW, zH, 6));
}

export function bootPhaser(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GRID_W * TILE,
    height: GRID_H * TILE,
    pixelArt: true,
    antialias: false,
    zoom: fitZoom(),
    backgroundColor: "#0a0908",
    scene: [CityScene]
  });
}
