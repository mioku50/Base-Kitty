"use client";

import { useFarcaster } from "./FarcasterProvider";

interface Props {
  onPlay: () => void;
  onLeaderboard: () => void;
}

export default function EntryScreen({ onPlay, onLeaderboard }: Props) {
  const { user, isSDKLoaded, signIn } = useFarcaster();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0533] via-[#0d1b2a] to-[#0a0020]" />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-purple-400/20 animate-pulse"
            style={{
              width: `${6 + (i % 3) * 4}px`,
              height: `${6 + (i % 3) * 4}px`,
              top: `${10 + (i * 12) % 90}%`,
              left: `${5 + (i * 13) % 90}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${2 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-xs">
        {/* Logo / kitty */}
        <div className="flex flex-col items-center mb-2">
          <span className="text-lg opacity-70">✨</span>
          <span className="text-7xl leading-none mb-1">🐱</span>
          <span className="text-lg opacity-70">😇</span>
        </div>

        <h1 className="text-3xl font-black text-white text-center tracking-tight mb-1">
          Base Kitty
        </h1>
        <p className="text-purple-300 text-sm font-medium mb-6 text-center">
          Rise from Web2 to Onchain Heaven!
        </p>

        {/* User profile card */}
        {user ? (
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 mb-5 flex items-center gap-3">
            {user.pfpUrl ? (
              <img
                src={user.pfpUrl}
                alt=""
                className="w-10 h-10 rounded-full border-2 border-purple-500/50"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center text-xl">
                😺
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">
                {user.displayName || user.username}
              </p>
              <p className="text-zinc-400 text-xs truncate">
                @{user.username || `fid:${user.fid}`}
              </p>
            </div>
            <div className="text-green-400 text-xs font-medium px-2 py-1 bg-green-400/10 rounded-full">
              ✓ Connected
            </div>
          </div>
        ) : (
          <button
            onClick={signIn}
            disabled={!isSDKLoaded}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 mb-5 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <span className="text-lg">🟣</span>
            <span className="text-white font-semibold text-sm">
              Sign in with Farcaster
            </span>
          </button>
        )}

        {/* Play button */}
        <button
          onClick={onPlay}
          className="w-full py-4 rounded-2xl font-black text-white text-lg mb-3 shadow-lg shadow-purple-500/25 active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
          }}
        >
          🎮 PLAY
        </button>

        {/* Leaderboard button */}
        <button
          onClick={onLeaderboard}
          className="w-full py-3 rounded-2xl font-bold text-white text-sm border border-white/15 hover:bg-white/5 transition-colors mb-4"
        >
          🏆 Leaderboard
        </button>

        {/* Footer */}
        <p className="text-zinc-600 text-[10px] text-center">
          Built on Base • Powered by Farcaster
        </p>
      </div>
    </div>
  );
}
