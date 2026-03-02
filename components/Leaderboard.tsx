"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useFarcaster } from "./FarcasterProvider";
import KittyIcon from "./KittyIcon";

type Mode = "weekly" | "alltime" | "friends";

interface LeaderboardEntry {
  rank: number;
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  score: number;
  badges: string[];
}

interface Props {
  onBack: () => void;
}

export default function Leaderboard({ onBack }: Props) {
  const { user } = useFarcaster();
  const [mode, setMode] = useState<Mode>("weekly");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendFids, setFriendFids] = useState<number[]>([]);

  // Fetch friend FIDs from Neynar on mount
  useEffect(() => {
    if (!user) return;
    fetch(`/api/friends?fid=${user.fid}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.fids) setFriendFids(data.fids);
      })
      .catch(() => {});
  }, [user]);

  const fetchLeaderboard = useCallback(
    async (m: Mode) => {
      setLoading(true);
      const params = new URLSearchParams({ mode: m });
      if (user) params.set("fid", String(user.fid));
      if (m === "friends" && friendFids.length > 0) {
        params.set("friends", friendFids.join(","));
      }
      try {
        const res = await fetch(`/api/score?${params}`);
        const data = await res.json();
        setEntries(data.leaderboard || []);
      } catch {
        setEntries([]);
      }
      setLoading(false);
    },
    [user, friendFids]
  );

  useEffect(() => {
    fetchLeaderboard(mode);
  }, [mode, fetchLeaderboard]);

  const tabs: { key: Mode; label: string; icon: ReactNode }[] = [
    { key: "weekly", label: "Weekly", icon: <KittyIcon size={14} /> },
    { key: "alltime", label: "All Time", icon: "😺" },
    { key: "friends", label: "Friends", icon: <KittyIcon size={14} /> },
  ];

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[#1a0533] via-[#0d1b2a] to-[#0a0020] z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <button
          onClick={onBack}
          className="text-white/70 hover:text-white text-sm font-medium transition-colors"
        >
          ← Back
        </button>
        <h2 className="text-white font-black text-lg">😸 Leaderboard</h2>
        <div className="w-12" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-3 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setMode(tab.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mode === tab.key
                ? "bg-purple-500/30 border border-purple-500/50 text-purple-200"
                : "bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10"
            }`}
          >
            <span className="inline-flex items-center justify-center">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-zinc-500 text-sm animate-pulse">Loading…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <KittyIcon size={36} />
            <p className="text-zinc-500 text-sm text-center mt-2">
              {mode === "friends"
                ? "No friends with scores yet.\nPlay & share to invite them!"
                : "No scores yet — be the first!"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((entry, idx) => {
              const isMe = user && entry.fid === user.fid;
              const medalEmoji =
                idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;

              return (
                <div
                  key={entry.fid}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors ${
                    isMe
                      ? "bg-purple-500/15 border border-purple-500/30"
                      : "bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]"
                  }`}
                >
                  {/* Rank */}
                  <div className="w-7 text-center shrink-0">
                    {medalEmoji !== null ? (
                      <span className="text-lg">{medalEmoji}</span>
                    ) : (
                      <span className="text-zinc-500 text-xs font-mono">
                        {entry.rank}
                      </span>
                    )}
                  </div>

                  {/* Avatar */}
                  {entry.pfpUrl ? (
                    <img
                      src={entry.pfpUrl}
                      alt=""
                      className="w-8 h-8 rounded-full shrink-0 border border-white/10"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
                      <KittyIcon size={16} />
                    </div>
                  )}

                  {/* Name + badges */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-bold truncate ${
                        isMe ? "text-purple-200" : "text-white"
                      }`}
                    >
                      {entry.username || entry.displayName}
                      {isMe && (
                        <span className="text-purple-400 text-[10px] ml-1">
                          (you)
                        </span>
                      )}
                    </p>
                    {entry.badges && entry.badges.length > 0 && (
                      <div className="flex gap-1 mt-0.5 overflow-hidden">
                        {entry.badges.slice(0, 2).map((badge: string, bi: number) => (
                          <span
                            key={bi}
                            className="text-[9px] text-purple-400/70 bg-purple-500/10 px-1.5 py-0.5 rounded-full truncate max-w-[100px]"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <span
                    className={`text-sm font-mono font-bold shrink-0 ${
                      isMe ? "text-purple-300" : "text-zinc-300"
                    }`}
                  >
                    {entry.score.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 shrink-0">
        <p className="text-zinc-600 text-[10px] text-center mb-2">
          End of season prize pool: 1,000,000 $mioku for Top 10 players.
        </p>
      </div>
    </div>
  );
}
