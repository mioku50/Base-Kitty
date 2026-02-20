import * as Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import GameScene from "./scenes/GameScene";

export function createGameConfig(
  parent: HTMLElement,
  onGameOver: (score: number) => void
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    width: 400,
    height: 650,
    parent,
    backgroundColor: "#0a0020",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, new GameScene(onGameOver)],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
