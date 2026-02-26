"use client";

import { useEffect, useRef, useCallback } from "react";
import type { GameStats } from "../lib/game/types";

interface Props {
  onGameOver: (stats: GameStats) => void;
}

export default function PhaserGame({ onGameOver }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);

  const startGame = useCallback(async () => {
    if (!containerRef.current) return;
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    const PhaserLib = await import("phaser");
    const { createGameConfig } = await import("../lib/game/config");

    const config = createGameConfig(containerRef.current, onGameOver);
    gameRef.current = new PhaserLib.Game(config);
  }, [onGameOver]);

  useEffect(() => {
    startGame();
    return () => {
      gameRef.current?.destroy(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
