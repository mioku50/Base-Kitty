"use client";

import { useEffect, useRef, useState } from "react";
import GameOverlay from "./GameOverlay";

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  const startGame = async () => {
    if (!containerRef.current) return;
    if (gameRef.current) {
      gameRef.current.destroy(true);
      gameRef.current = null;
    }

    setGameOver(false);
    setFinalScore(0);

    const PhaserLib = await import("phaser");
    const { createGameConfig } = await import("../lib/game/config");

    const handleGameOver = (score: number) => {
      setFinalScore(score);
      setGameOver(true);
    };

    const config = createGameConfig(containerRef.current, handleGameOver);
    gameRef.current = new PhaserLib.Game(config);
  };

  useEffect(() => {
    startGame();
    return () => {
      gameRef.current?.destroy(true);
    };
  }, []); // mount only

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {gameOver && (
        <GameOverlay score={finalScore} onRestart={startGame} />
      )}
    </div>
  );
}
