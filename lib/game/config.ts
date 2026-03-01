import * as Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import GameScene from "./scenes/GameScene";
import type { GameOverCallback, SocialFriend } from "./types";

export function createGameConfig(
  parent: HTMLElement,
  onGameOver: GameOverCallback,
  socialFriends: SocialFriend[] = []
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
    scene: [BootScene, new GameScene(onGameOver, socialFriends)],
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
