"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useFarcaster } from "./FarcasterProvider";
import KittyIcon from "./KittyIcon";
import type { GameStats } from "../lib/game/types";
import { sdk } from "@farcaster/miniapp-sdk";

interface Props {
  stats: GameStats;
  onRestart: () => void;
  onLeaderboard: () => void;
}

function CoinIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/assets/Based Energy Coin.PNG"
      alt="Coin"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

function BadgeIcon({ badge }: { badge: string }) {
  if (badge.includes("Bear")) return <span>🐻</span>;
  if (badge.includes("Stage")) return <span>🚀</span>;
  if (badge.includes("Prayer")) return <span>😇</span>;
  if (badge.includes("Coin")) return <CoinIcon size={14} />;
  if (badge.includes("Legend") || badge.includes("Master")) {
    return <KittyIcon size={14} />;
  }
  return <span>⭐</span>;
}

export default function GameOverlay({ stats, onRestart, onLeaderboard }: Props) {
  const { user, composeCast } = useFarcaster();
  const [contextUser, setContextUser] = useState<{
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  } | null>(null);
  const [shared, setShared] = useState(false);
  const [revived, setRevived] = useState(false);
  const [bestScore, setBestScore] = useState(stats.score);
  const [badges, setBadges] = useState<string[]>([]);
  const isNewBest = stats.score >= bestScore;
  const effectiveUser = user || contextUser;
  const bestScoreKey = useMemo(
    () => `nimbus_ascent:best:${effectiveUser?.fid ?? "guest"}`,
    [effectiveUser?.fid]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(bestScoreKey);
    const localBest = raw ? Number(raw) : 0;
    const safeLocalBest = Number.isFinite(localBest) ? localBest : 0;
    const mergedBest = Math.max(safeLocalBest, stats.score);
    setBestScore((prev) => Math.max(prev, mergedBest));
    window.localStorage.setItem(bestScoreKey, String(mergedBest));
  }, [bestScoreKey, stats.score]);

  useEffect(() => {
    if (user) return;

    let mounted = true;
    sdk.context
      .then((ctx) => {
        if (!mounted || !ctx?.user) return;
        setContextUser({
          fid: ctx.user.fid,
          username: ctx.user.username ?? undefined,
          displayName: ctx.user.displayName ?? undefined,
          pfpUrl: ctx.user.pfpUrl ?? undefined,
        });
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [user]);

  // Submit score on mount
  useEffect(() => {
    if (effectiveUser) {
      const referrerFid =
        typeof window !== "undefined"
          ? Number(window.localStorage.getItem("nimbus_ascent:referrer_fid") || 0)
          : 0;
      fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fid: effectiveUser.fid,
          username: effectiveUser.username,
          displayName: effectiveUser.displayName,
          pfpUrl: effectiveUser.pfpUrl,
          score: stats.score,
          enemiesKilled: stats.enemiesKilled,
          coinsCollected: stats.coinsCollected,
          maxStage: stats.maxStage,
          prayersUsed: stats.prayersUsed,
          referrerFid: Number.isFinite(referrerFid) && referrerFid > 0 ? referrerFid : undefined,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.bestScore) {
            const mergedBest = Math.max(Number(data.bestScore), stats.score);
            setBestScore(mergedBest);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(bestScoreKey, String(mergedBest));
            }
          }
          if (data.badges) setBadges(data.badges);
        })
        .catch(() => {});
    } else {
      // Derive local badges for non-authenticated users
      const b: string[] = [];
      if (stats.enemiesKilled >= 1) b.push(`Bear Slayer x${stats.enemiesKilled}`);
      if (stats.maxStage >= 1) b.push(`Stage ${stats.maxStage + 1} Reached`);
      if (stats.prayersUsed >= 1) b.push(`Prayer Warrior x${stats.prayersUsed}`);
      setBadges(b);
    }
  }, [stats, effectiveUser, bestScoreKey]);

  // Build OG image URL for the share card
  const ogUrl = (() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({
      score: String(stats.score),
      username: effectiveUser?.username || "anon",
      stage: String(stats.maxStage),
      badges: badges.join(","),
    });
    return `${base}/api/og?${params}`;
  })();

  const handleShare = useCallback(async () => {
    const appUrl = typeof window !== "undefined" ? window.location.origin : "";
    const badgeText =
      badges.length > 0
        ? `\n${badges.slice(0, 3).map((b: string) => `😺 ${b}`).join(" ")}`
        : "";
    const text = `😺 I scored ${stats.score.toLocaleString()} in Nimbus Ascent!${badgeText}\n\nCan you beat me?`;
    await composeCast(text, { embeds: [appUrl, ogUrl] });
    setShared(true);
    setTimeout(() => setRevived(true), 1200);
  }, [stats.score, badges, composeCast, ogUrl]);

  if (revived) {
    onRestart();
    return null;
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-start bg-black/85 backdrop-blur-sm z-50 p-4 overflow-y-auto">
      {/* Game Over header */}
      <div className="mt-3 mb-2 relative w-44 h-20 shrink-0">
        <Image
          src="/assets/Game Over.PNG"
          alt="Game Over"
          fill
          style={{ objectFit: "contain" }}
          priority
        />
      </div>

      {/* Score section */}
      <div className="flex flex-col items-center mb-2">
        <p className="text-white text-2xl font-black mb-0.5">
          {stats.score.toLocaleString()}
          <span className="text-zinc-400 text-sm font-normal ml-1">pts</span>
        </p>
        {isNewBest && (
          <span className="text-yellow-400 text-xs font-bold animate-pulse">
            🌟 NEW BEST SCORE!
          </span>
        )}
        <p className="text-zinc-500 text-xs">
          Best: <span className="text-purple-300 font-mono">{bestScore.toLocaleString()}</span>
        </p>
      </div>

      {/* Session stats */}
      <div className="w-full max-w-xs grid grid-cols-3 gap-2 mb-3">
        {[
          { icon: <span>🐻</span>, val: stats.enemiesKilled, label: "Bears" },
          { icon: <CoinIcon size={18} />, val: stats.coinsCollected, label: "Coins" },
          { icon: <span>😇</span>, val: stats.prayersUsed, label: "Prayers" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white/5 border border-white/10 rounded-xl p-2 text-center"
          >
            <span className="text-lg inline-flex items-center justify-center">{s.icon}</span>
            <p className="text-white font-bold text-sm">{s.val}</p>
            <p className="text-zinc-500 text-[10px]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="w-full max-w-xs flex flex-wrap gap-1.5 justify-center mb-3">
          {badges.slice(0, 4).map((badge: string, i: number) => (
            <span
              key={i}
              className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 inline-flex items-center gap-1"
            >
              <BadgeIcon badge={badge} />
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Share card preview */}
      <div className="w-full max-w-xs mb-3 rounded-2xl overflow-hidden border border-white/10 shadow-lg shadow-purple-500/10">
        <div className="relative w-full aspect-[1200/630] bg-[#1a0533]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogUrl}
            alt="Share card"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Share to Revive */}
      {!shared ? (
        <button
          onClick={handleShare}
          className="w-full max-w-xs py-3.5 px-6 rounded-2xl font-black text-white text-base mb-2 shadow-lg shadow-purple-500/25 active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
          }}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <KittyIcon size={18} />
            Share to Farcaster → Revive!
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2 text-green-400 font-bold text-base mb-2">
          <span>✅ Shared! Reviving…</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="w-full max-w-xs flex gap-2 mb-3">
        <button
          onClick={onRestart}
          className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm border border-white/15 hover:bg-white/5 transition-colors"
        >
          🔄 Restart
        </button>
        <button
          onClick={onLeaderboard}
          className="flex-1 py-2.5 rounded-2xl font-bold text-white text-sm border border-white/15 hover:bg-white/5 transition-colors"
        >
          😼 Leaderboard
        </button>
      </div>

      <p className="text-zinc-600 text-[10px] mb-2">
        Top 10 weekly winners receive $mioku tokens!
      </p>
    </div>
  );
}
