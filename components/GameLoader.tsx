"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { GameStats, SocialFriend } from "../lib/game/types";
import { useFarcaster } from "./FarcasterProvider";
import EntryScreen from "./EntryScreen";
import GameOverlay from "./GameOverlay";
import Leaderboard from "./Leaderboard";

const PhaserGame = dynamic(() => import("./PhaserGame"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full bg-[#0a0020] text-white text-lg">
      Loading Nimbus Ascent…
    </div>
  ),
});

type Screen = "entry" | "playing" | "gameover" | "leaderboard";
const SOCIAL_FETCH_TIMEOUT_MS = 8000;
const MAX_SOCIAL_FRIENDS = 24;

interface LeaderboardFallbackEntry {
  fid: number;
  username?: string;
  pfpUrl?: string;
}

function normalizeSocialFriends(friends: SocialFriend[]): SocialFriend[] {
  const byFid = new Map<number, SocialFriend>();
  friends.forEach((friend) => {
    if (!friend || typeof friend.fid !== "number") return;
    if (!friend.pfpUrl) return;
    if (byFid.has(friend.fid)) return;
    byFid.set(friend.fid, {
      fid: friend.fid,
      username: friend.username || `fid:${friend.fid}`,
      pfpUrl: friend.pfpUrl,
    });
  });
  return [...byFid.values()].slice(0, MAX_SOCIAL_FRIENDS);
}

export default function GameLoader() {
  const { user } = useFarcaster();
  const [screen, setScreen] = useState<Screen>("entry");
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [socialFriends, setSocialFriends] = useState<SocialFriend[]>([]);

  // Fetch social friends (following first, then fallback to all-time top users).
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SOCIAL_FETCH_TIMEOUT_MS);
    let cancelled = false;

    const fetchJson = async <T,>(url: string): Promise<T | null> => {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "cache-control": "no-store",
        },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    };

    const run = async () => {
      const pool: SocialFriend[] = [];

      if (user) {
        const friendsData = await fetchJson<{ fids?: number[] }>(
          `/api/friends?fid=${user.fid}`
        );
        const fids = Array.isArray(friendsData?.fids)
          ? friendsData.fids.filter((fid): fid is number => typeof fid === "number").slice(0, MAX_SOCIAL_FRIENDS)
          : [];

        if (fids.length > 0) {
          const profilesData = await fetchJson<{ users?: SocialFriend[] }>(
            `/api/profiles?fids=${fids.join(",")}`
          );
          if (Array.isArray(profilesData?.users)) {
            pool.push(...profilesData.users.filter((u) => u.fid !== user.fid));
          }
        }
      }

      // Fallback source: top users from all-time leaderboard.
      if (pool.length < 6) {
        const scoreData = await fetchJson<{ leaderboard?: LeaderboardFallbackEntry[] }>(
          "/api/score?mode=alltime"
        );
        if (Array.isArray(scoreData?.leaderboard)) {
          scoreData.leaderboard.forEach((entry) => {
            if (!entry || typeof entry.fid !== "number" || !entry.pfpUrl) return;
            if (user && entry.fid === user.fid) return;
            pool.push({
              fid: entry.fid,
              username: entry.username || `fid:${entry.fid}`,
              pfpUrl: entry.pfpUrl,
            });
          });
        }
      }

      const normalized = normalizeSocialFriends(pool);
      if (!cancelled && normalized.length > 0) {
        setSocialFriends(normalized);
      }
    };

    run().catch(() => {});

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
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
