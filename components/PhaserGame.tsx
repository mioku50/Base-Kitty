"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { GameStats, SocialFriend } from "../lib/game/types";
import { GAME_EVENTS } from "../lib/game/types";
import PauseMenu from "./PauseMenu";

interface Props {
  onGameOver: (stats: GameStats) => void;
  onLeaderboard: () => void;
  onRestart: () => void;
  socialFriends?: SocialFriend[];
}

export default function PhaserGame({ onGameOver, onLeaderboard, onRestart, socialFriends = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const getScene = useCallback((): import("../lib/game/scenes/GameScene").default | null => {
    if (!gameRef.current) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (gameRef.current.scene.getScene("GameScene") as any) ?? null;
  }, []);

  const startGame = useCallback(async () => {
    if (!containerRef.current) return;
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    const PhaserLib = await import("phaser");
    const { createGameConfig } = await import("../lib/game/config");

    const config = createGameConfig(containerRef.current, onGameOver, socialFriends);
    const game = new PhaserLib.Game(config);
    gameRef.current = game;

    // Listen to game-level events emitted by GameScene
    game.events.on(GAME_EVENTS.PAUSE, () => setIsPaused(true));
    game.events.on(GAME_EVENTS.RESUME, () => setIsPaused(false));
  }, [onGameOver, socialFriends]);

  useEffect(() => {
    startGame();
    return () => {
      gameRef.current?.destroy(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scene = getScene();
    if (!scene) return;
    scene.setSocialFriends(socialFriends);
  }, [socialFriends, getScene]);

  useEffect(() => {
    const onResize = () => {
      const game = gameRef.current;
      const parent = containerRef.current;
      if (!game || !parent) return;
      game.scale.resize(parent.clientWidth, parent.clientHeight);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const handleResume = useCallback(() => {
    getScene()?.resumeGame();
  }, [getScene]);

  const handleRestartFromPause = useCallback(() => {
    setIsPaused(false);
    onRestart();
  }, [onRestart]);

  const handleLeaderboardFromPause = useCallback(() => {
    // Resume physics briefly so scene stays clean, then navigate
    getScene()?.resumeGame();
    setIsPaused(false);
    onLeaderboard();
  }, [getScene, onLeaderboard]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      const game = gameRef.current;
      if (game) {
        game.sound.mute = !next;
      }
      return next;
    });
  }, []);

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {isPaused && (
        <PauseMenu
          onResume={handleResume}
          onRestart={handleRestartFromPause}
          onLeaderboard={handleLeaderboardFromPause}
          soundEnabled={soundEnabled}
          onToggleSound={handleToggleSound}
        />
      )}
    </div>
  );
}
