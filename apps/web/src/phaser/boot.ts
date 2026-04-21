import Phaser from "phaser";
import { CityScene, TILE, GRID_W, GRID_H } from "./scenes/CityScene";

export function bootPhaser(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GRID_W * TILE,
    height: GRID_H * TILE,
    pixelArt: true,
    antialias: false,
    zoom: 4,
    backgroundColor: "#1a2f1a",
    scene: [CityScene]
  });
}
