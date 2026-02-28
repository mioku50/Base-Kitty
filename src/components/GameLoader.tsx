"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { GameStats, SocialFriend } from "~/lib/game/types";
import { useFarcaster } from "./FarcasterProvider";
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
  const { user } = useFarcaster();
  const [screen, setScreen] = useState<Screen>("entry");
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [socialFriends, setSocialFriends] = useState<SocialFriend[]>([]);

  // Fetch social friends once user is authenticated
  useEffect(() => {
    if (!user) return;
    fetch(`/api/friends?fid=${user.fid}`)
      .then((r) => r.json())
      .then((data: { fids?: number[] }) => {
        if (!data.fids || data.fids.length === 0) return;
        // Resolve fids → profiles via Neynar bulk lookup
        const fidsParam = data.fids.slice(0, 20).join(",");
        return fetch(`/api/profiles?fids=${fidsParam}`);
      })
      .then((r) => r?.json())
      .then((data: { users?: SocialFriend[] } | undefined) => {
        if (data?.users) setSocialFriends(data.users);
      })
      .catch(() => {});
  }, [user]);

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
      {/* Phaser canvas — mounted while playing, keeps key for remounts */}
      {screen === "playing" && (
        <PhaserGame
          key={gameKey}
          onGameOver={handleGameOver}
          onRestart={handleRestart}
          onLeaderboard={handleLeaderboard}
          socialFriends={socialFriends}
        />
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
