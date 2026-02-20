"use client";

import { useState } from "react";
import Image from "next/image";

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  avatar: string;
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, name: "vitalik.eth", score: 9842, avatar: "🧙" },
  { rank: 2, name: "jessepollak", score: 8201, avatar: "🦊" },
  { rank: 3, name: "dwr.eth", score: 7654, avatar: "🐱" },
  { rank: 4, name: "jayme", score: 6400, avatar: "🚀" },
  { rank: 5, name: "mioku50", score: 5120, avatar: "🐱" },
];

interface Props {
  score: number;
  onRestart: () => void;
}

export default function GameOverlay({ score, onRestart }: Props) {
  const [shared, setShared] = useState(false);
  const [revived, setRevived] = useState(false);

  const handleShare = () => {
    // Mock Farcaster Frame v2 SDK share
    setShared(true);
    setTimeout(() => {
      setRevived(true);
    }, 1200);
  };

  if (revived) {
    onRestart();
    return null;
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-50 p-4">
      {/* Game Over image */}
      <div className="mb-4 relative w-52 h-24">
        <Image
          src="/assets/game-over.png"
          alt="Game Over"
          fill
          style={{ objectFit: "contain" }}
          priority
        />
      </div>

      <p className="text-white text-2xl font-bold mb-1">
        Score: <span className="text-purple-400">{score}</span>
      </p>
      <p className="text-zinc-400 text-sm mb-6">Keep climbing, onchain hero!</p>

      {/* Share to Revive */}
      {!shared ? (
        <button
          onClick={handleShare}
          className="w-full max-w-xs py-3 px-6 rounded-2xl font-bold text-white text-base mb-4"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
          }}
        >
          🔁 Share to Farcaster → Revive!
        </button>
      ) : (
        <div className="flex items-center gap-2 text-green-400 font-bold text-base mb-4">
          <span>✅ Shared! Reviving…</span>
        </div>
      )}

      <button
        onClick={onRestart}
        className="w-full max-w-xs py-2 px-6 rounded-2xl font-semibold text-white text-sm mb-6 border border-white/20 hover:bg-white/10 transition-colors"
      >
        ↩ Restart Without Revive
      </button>

      {/* Mock Leaderboard */}
      <div className="w-full max-w-xs bg-white/5 border border-white/10 rounded-2xl p-4">
        <h3 className="text-white font-bold text-center mb-3 text-sm tracking-wide uppercase">
          🏆 Leaderboard
        </h3>
        <div className="space-y-2">
          {MOCK_LEADERBOARD.map((entry) => (
            <div
              key={entry.rank}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 w-5 text-right">
                  {entry.rank}.
                </span>
                <span className="text-base leading-none">{entry.avatar}</span>
                <span className="text-white">{entry.name}</span>
              </div>
              <span className="text-purple-300 font-mono">
                {entry.score.toLocaleString()}
              </span>
            </div>
          ))}
          {/* Player's score highlighted */}
          <div className="border-t border-white/10 pt-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 w-5 text-right">—</span>
              <span className="text-base leading-none">😺</span>
              <span className="text-purple-300 font-semibold">You</span>
            </div>
            <span className="text-purple-300 font-mono">
              {score.toLocaleString()}
            </span>
          </div>
        </div>
        <p className="text-zinc-500 text-xs text-center mt-3">
          Top 10 weekly winners receive $mioku tokens!
        </p>
      </div>
    </div>
  );
}
