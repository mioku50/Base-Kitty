import * as Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import GameScene from "./scenes/GameScene";
import type { GameOverCallback, SocialFriend } from "./types";

export function createGameConfig(
  parent: HTMLElement,
  onGameOver: GameOverCallback,
  socialFriends: SocialFriend[] = []
): Phaser.Types.Core.GameConfig {
  const initialWidth = parent.clientWidth || 400;
  const initialHeight = parent.clientHeight || 650;

  return {
    type: Phaser.AUTO,
    width: initialWidth,
    height: initialHeight,
    parent,
    backgroundColor: "#0a0020",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, new GameScene(onGameOver, socialFriends)],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
