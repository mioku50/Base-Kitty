"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { GameStats } from "../lib/game/types";
import EntryScreen from "./EntryScreen";
import GameOverlay from "./GameOverlay";
import Leaderboard from "./Leaderboard";

const PhaserGame = dynamic(() => import("./PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full bg-[#0a0020] text-white text-lg">
      Loading Base Kitty…
    </div>
  ),
});

type Screen = "entry" | "playing" | "gameover" | "leaderboard";

export default function GameLoader() {
  const [screen, setScreen] = useState<Screen>("entry");
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const handlePlay = useCallback(() => {
    setLastStats(null);
    setGameKey((k) => k + 1);
    setScreen("playing");
  }, []);

  const handleGameOver = useCallback((stats: GameStats) => {
    setLastStats(stats);
    setScreen("gameover");
  }, []);

  const handleRestart = useCallback(() => {
    setLastStats(null);
    setGameKey((k) => k + 1);
    setScreen("playing");
  }, []);

  const handleLeaderboard = useCallback(() => {
    setScreen("leaderboard");
  }, []);

  const handleBackFromLeaderboard = useCallback(() => {
    setScreen(lastStats ? "gameover" : "entry");
  }, [lastStats]);

  return (
    <div className="relative w-full h-full">
      {/* Phaser canvas always mounted when playing */}
      {screen === "playing" && (
        <PhaserGame key={gameKey} onGameOver={handleGameOver} />
      )}

      {/* Entry screen */}
      {screen === "entry" && (
        <EntryScreen onPlay={handlePlay} onLeaderboard={handleLeaderboard} />
      )}

      {/* Game Over overlay */}
      {screen === "gameover" && lastStats && (
        <GameOverlay
          stats={lastStats}
          onRestart={handleRestart}
          onLeaderboard={handleLeaderboard}
        />
      )}

      {/* Leaderboard */}
      {screen === "leaderboard" && (
        <Leaderboard onBack={handleBackFromLeaderboard} />
      )}
    </div>
  );
}
