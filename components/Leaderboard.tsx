"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const REQUEST_TIMEOUT_MS = 8000;
const CACHE_PREFIX = "nimbus_ascent:leaderboard:";
const AUTH_USER_STORAGE_KEY = "nimbus_ascent:auth_user:v2";

function readCachedEntries(mode: Mode): LeaderboardEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${mode}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { entries?: LeaderboardEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : null;
  } catch {
    return null;
  }
}

function writeCachedEntries(mode: Mode, entries: LeaderboardEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${CACHE_PREFIX}${mode}`,
      JSON.stringify({ entries, ts: Date.now() })
    );
  } catch {
    // Ignore localStorage errors.
  }
}

export default function Leaderboard({ onBack }: Props) {
  const { user, composeCast } = useFarcaster();
  const [viewerFallback, setViewerFallback] = useState<{
    fid?: number;
    username?: string;
    displayName?: string;
  } | null>(null);
  const [mode, setMode] = useState<Mode>("weekly");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [friendFids, setFriendFids] = useState<number[]>([]);
  const [sharePending, setSharePending] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const viewer = user ?? viewerFallback ?? null;
  const viewerFid = typeof viewer?.fid === "number" ? viewer.fid : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        fid?: number;
        username?: string;
        displayName?: string;
      };
      setViewerFallback(parsed);
    } catch {
      // Ignore invalid cached auth payload.
    }
  }, []);

  // Fetch friend FIDs from Neynar on mount
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    fetch(`/api/friends?fid=${user.fid}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("friends fetch failed"))))
      .then((data) => {
        if (data.fids) setFriendFids(data.fids);
      })
      .catch(() => {});
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [user]);

  const fetchLeaderboard = useCallback(
    async (m: Mode) => {
      const cached = readCachedEntries(m);
      if (cached && cached.length > 0) {
        setEntries(cached);
      }

      const reqId = ++requestSeq.current;
      setLoading(true);
      const params = new URLSearchParams({ mode: m });
      if (viewerFid !== null) params.set("fid", String(viewerFid));
      if (m === "friends") {
        if (friendFids.length > 0) {
          params.set("friends", friendFids.join(","));
        } else if (viewerFid !== null) {
          // In friends mode without fetched list, at least show current user.
          params.set("friends", String(viewerFid));
        }
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`/api/score?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "cache-control": "no-store",
          },
        });
        if (!res.ok) throw new Error(`Leaderboard request failed: ${res.status}`);
        const data = await res.json();
        if (reqId !== requestSeq.current) return;
        const nextEntries = Array.isArray(data.leaderboard) ? data.leaderboard : [];
        setEntries(nextEntries);
        writeCachedEntries(m, nextEntries);
      } catch {
        if (reqId !== requestSeq.current) return;
        if (!cached) setEntries([]);
      } finally {
        window.clearTimeout(timeout);
        if (reqId === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [viewerFid, friendFids]
  );

  useEffect(() => {
    fetchLeaderboard(mode);
  }, [mode, fetchLeaderboard]);

  const tabs: { key: Mode; label: string; icon: ReactNode }[] = [
    { key: "weekly", label: "Weekly", icon: <KittyIcon size={14} /> },
    { key: "alltime", label: "All Time", icon: "😺" },
    { key: "friends", label: "Friends", icon: <KittyIcon size={14} /> },
  ];

  const myEntry = useMemo(() => {
    if (entries.length === 0) return null;

    if (viewerFid !== null) {
      const byFid = entries.find((entry) => entry.fid === viewerFid);
      if (byFid) return byFid;
    }

    const normalizedViewerUsername = (viewer?.username || "").trim().toLowerCase();
    const normalizedViewerDisplayName = (viewer?.displayName || "").trim().toLowerCase();
    if (!normalizedViewerUsername && !normalizedViewerDisplayName) return null;

    return (
      entries.find((entry) => {
        const entryUsername = (entry.username || "").trim().toLowerCase();
        const entryDisplayName = (entry.displayName || "").trim().toLowerCase();
        return (
          (normalizedViewerUsername && entryUsername === normalizedViewerUsername) ||
          (normalizedViewerDisplayName && entryDisplayName === normalizedViewerDisplayName)
        );
      }) || null
    );
  }, [entries, viewer?.displayName, viewer?.username, viewerFid]);

  const handleShareLeaderboard = useCallback(async () => {
    if (sharePending) return;

    const appUrl =
      (process.env.NEXT_PUBLIC_URL && process.env.NEXT_PUBLIC_URL.trim()) ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!appUrl) {
      setShareMessage("App URL is not configured");
      return;
    }

    const modeLabel = mode === "alltime" ? "all-time" : mode === "friends" ? "friends" : "weekly";
    const rankText = myEntry ? `#${myEntry.rank}` : "unranked";
    const scoreText = myEntry ? myEntry.score.toLocaleString() : "0";

    const params = new URLSearchParams({
      kind: "leaderboard",
      username: viewer?.username || viewer?.displayName || "player",
      mode,
      rank: myEntry ? String(myEntry.rank) : "unranked",
      score: myEntry ? String(myEntry.score) : "0",
      prize: "10000",
      viral: "Catch me in the clouds before I claim the season bag.",
    });
    const ogUrl = `${appUrl}/api/og?${params.toString()}`;
    const text = myEntry
      ? `☁️ I’m ${rankText} in Nimbus Ascent ${modeLabel} leaderboard. Season 1 pool: 10000 $Degen tokens. Beat my ${scoreText} pts if you can 😼`
      : "☁️ Nimbus Ascent Season 1 pool: 10000 $Degen tokens. I’m climbing the leaderboard now, jump in and try to pass me 😼";

    setSharePending(true);
    setShareMessage(null);
    try {
      await composeCast(text, { embeds: [appUrl, ogUrl] });
      setShareMessage("Leaderboard card opened in composer ✓");
    } catch {
      setShareMessage("Failed to open composer");
    } finally {
      setSharePending(false);
    }
  }, [composeCast, mode, myEntry, sharePending, viewer?.displayName, viewer?.username]);

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

      {/* Prize pool highlight */}
      <div className="mx-4 mb-3 shrink-0 rounded-2xl border border-purple-400/45 bg-purple-500/15 px-3 py-2.5 shadow-lg shadow-purple-900/25">
        <p className="text-center text-purple-200 text-sm font-black leading-tight">
          🏆 SEASON 1 PRIZE POOL
        </p>
        <p className="text-center text-purple-100 text-lg font-black tracking-wide">
          10000 $Degen tokens
        </p>
        <p className="text-center text-purple-300 text-xs font-semibold">
          For Top 3 players
        </p>
      </div>

      <div className="mx-4 mb-3 shrink-0 rounded-2xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-2.5">
        <p className="text-cyan-100 text-xs font-black text-center">
          ⚡ Share your leaderboard card
        </p>
        <p className="mt-1 text-center text-white text-sm font-bold">
          {myEntry ? `Your rank: #${myEntry.rank}` : "Your rank: Unranked (play more to enter Top 50)"}
        </p>
        <p className="text-center text-cyan-200 text-xs font-semibold mt-0.5">
          Season 1: 10000 $Degen tokens
        </p>
        <button
          onClick={() => {
            handleShareLeaderboard().catch(() => {
              setShareMessage("Failed to open composer");
            });
          }}
          disabled={sharePending}
          className="mt-2 w-full rounded-xl border border-cyan-300/35 bg-cyan-500/20 py-2 text-sm font-black text-cyan-100 disabled:opacity-50"
        >
          {sharePending ? "Opening..." : "Share Rank Card 🚀"}
        </button>
        {shareMessage && (
          <p className="mt-1 text-center text-[11px] text-cyan-200/90 font-semibold">{shareMessage}</p>
        )}
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
              const isMe = myEntry ? entry.fid === myEntry.fid : false;
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

    </div>
  );
}
