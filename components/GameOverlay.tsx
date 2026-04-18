"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useFarcaster } from "./FarcasterProvider";
import KittyIcon from "./KittyIcon";
import type { GameStats } from "../lib/game/types";
import {
  flushPendingScores,
  submitScoreReliably,
  type ScoreSubmissionPayload,
} from "../lib/shared/scoreSubmission";

const REVIVE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface Props {
  stats: GameStats;
  onRestart: () => void;
  onLeaderboard: () => void;
  onRevive: () => void;
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

function formatTimeLeft(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

export default function GameOverlay({ stats, onRestart, onLeaderboard, onRevive }: Props) {
  const { user, composeCast, authToken } = useFarcaster();
  const [shared, setShared] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [revived, setRevived] = useState(false);
  const [reviveStatusLoading, setReviveStatusLoading] = useState(true);
  const [reviveEligible, setReviveEligible] = useState(true);
  const [reviveNextAt, setReviveNextAt] = useState<number | null>(null);
  const [reviveError, setReviveError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [bestScore, setBestScore] = useState(stats.score);
  const [badges, setBadges] = useState<string[]>([]);
  const isNewBest = stats.score >= bestScore;
  const effectiveUser = user;
  const bestScoreKey = useMemo(
    () => `nimbus_ascent:best:${effectiveUser?.fid ?? "guest"}`,
    [effectiveUser?.fid]
  );
  const reviveCooldownKey = useMemo(
    () => `nimbus_ascent:revive_last:${effectiveUser?.fid ?? "guest"}`,
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
    if (!reviveNextAt) return;
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [reviveNextAt]);

  const getQuickAuthToken = useCallback(async () => authToken, [authToken]);

  const readLocalReviveState = useCallback(() => {
    if (typeof window === "undefined") {
      return { eligible: true, nextAt: null as number | null };
    }
    const lastReviveRaw = Number(window.localStorage.getItem(reviveCooldownKey) || 0);
    const lastReviveAt = Number.isFinite(lastReviveRaw) ? lastReviveRaw : 0;
    if (!lastReviveAt) {
      return { eligible: true, nextAt: null as number | null };
    }
    const nextAt = lastReviveAt + REVIVE_COOLDOWN_MS;
    return {
      eligible: nextAt <= Date.now(),
      nextAt,
    };
  }, [reviveCooldownKey]);

  useEffect(() => {
    let cancelled = false;

    const applyLocalFallback = () => {
      const local = readLocalReviveState();
      if (cancelled) return;
      setReviveEligible(local.eligible);
      setReviveNextAt(local.eligible ? null : local.nextAt);
      setReviveStatusLoading(false);
    };

    const loadStatus = async () => {
      setReviveStatusLoading(true);
      setReviveError(null);

      const token = await getQuickAuthToken();
      if (!token) {
        applyLocalFallback();
        return;
      }

      try {
        const res = await fetch("/api/revive/status", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-store",
          },
          cache: "no-store",
        });

        if (!res.ok) {
          applyLocalFallback();
          return;
        }

        const data = (await res.json()) as {
          eligible?: boolean;
          nextReviveAt?: number | null;
          lastReviveAt?: number | null;
        };

        if (cancelled) return;

        const eligible = Boolean(data.eligible);
        const nextAt = typeof data.nextReviveAt === "number" ? data.nextReviveAt : null;
        const lastAt = typeof data.lastReviveAt === "number" ? data.lastReviveAt : 0;
        if (lastAt > 0 && typeof window !== "undefined") {
          window.localStorage.setItem(reviveCooldownKey, String(lastAt));
        }
        setReviveEligible(eligible);
        setReviveNextAt(eligible ? null : nextAt);
        setReviveStatusLoading(false);
      } catch {
        applyLocalFallback();
      }
    };

    loadStatus().catch(() => applyLocalFallback());

    return () => {
      cancelled = true;
    };
  }, [getQuickAuthToken, readLocalReviveState, reviveCooldownKey]);

  // Submit score on mount
  useEffect(() => {
    if (effectiveUser) {
      const referrerFid =
        typeof window !== "undefined"
          ? Number(window.localStorage.getItem("nimbus_ascent:referrer_fid") || 0)
          : 0;
      const payload: ScoreSubmissionPayload = {
        fid: effectiveUser.fid,
        username: effectiveUser.username || `fid:${effectiveUser.fid}`,
        displayName: effectiveUser.displayName || effectiveUser.username || `User ${effectiveUser.fid}`,
        pfpUrl: effectiveUser.pfpUrl || "",
        score: stats.score,
        enemiesKilled: stats.enemiesKilled,
        coinsCollected: stats.coinsCollected,
        maxStage: stats.maxStage,
        prayersUsed: stats.prayersUsed,
        runId: stats.runId,
        referrerFid: Number.isFinite(referrerFid) && referrerFid > 0 ? referrerFid : undefined,
      };

      let cancelled = false;

      submitScoreReliably(payload, authToken, { keepalive: true })
        .then((data) => {
          if (!data || cancelled) return;

          if (data.bestScore) {
            const mergedBest = Math.max(Number(data.bestScore), stats.score);
            setBestScore(mergedBest);
            if (typeof window !== "undefined") {
              window.localStorage.setItem(bestScoreKey, String(mergedBest));
            }
          }
          if (Array.isArray(data.badges)) {
            setBadges(data.badges);
          }
        })
        .catch(() => {
          // Submission stays queued and will retry on next app open.
        })
        .finally(() => {
          flushPendingScores(authToken).catch(() => {
            // Best-effort queue drain.
          });
        });

      return () => {
        cancelled = true;
      };
    } else {
      // Derive local badges for non-authenticated users
      const b: string[] = [];
      if (stats.enemiesKilled >= 1) b.push(`Bear Slayer x${stats.enemiesKilled}`);
      if (stats.maxStage >= 1) b.push(`Stage ${stats.maxStage + 1} Reached`);
      if (stats.prayersUsed >= 1) b.push(`Prayer Warrior x${stats.prayersUsed}`);
      setBadges(b);
    }
  }, [authToken, stats, effectiveUser, bestScoreKey]);

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
    if (isSharing || reviveStatusLoading || !reviveEligible) return;

    const appUrl = typeof window !== "undefined" ? window.location.origin : "";
    const badgeText =
      badges.length > 0
        ? `\n${badges.slice(0, 3).map((b: string) => `😺 ${b}`).join(" ")}`
        : "";
    const text = `😺 I scored ${stats.score.toLocaleString()} in Nimbus Ascent!${badgeText}\n\nCan you beat me?`;
    setReviveError(null);
    setIsSharing(true);

    try {
      await composeCast(text, { embeds: [appUrl, ogUrl] });

      const token = await getQuickAuthToken();
      const localNow = Date.now();
      let consumed = false;
      let nextAt: number | null = localNow + REVIVE_COOLDOWN_MS;
      let lastAt: number = localNow;

      if (token) {
        const res = await fetch("/api/revive/consume", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-store",
          },
        });

        if (res.ok) {
          const data = (await res.json()) as { nextReviveAt?: number; lastReviveAt?: number };
          consumed = true;
          nextAt = typeof data.nextReviveAt === "number" ? data.nextReviveAt : nextAt;
          lastAt = typeof data.lastReviveAt === "number" ? data.lastReviveAt : localNow;
        } else if (res.status === 409) {
          const data = (await res.json().catch(() => ({}))) as { nextReviveAt?: number };
          consumed = false;
          nextAt = typeof data.nextReviveAt === "number" ? data.nextReviveAt : localNow + REVIVE_COOLDOWN_MS;
        } else {
          // If auth/routing is temporarily unavailable, fallback to local cooldown gating.
          const local = readLocalReviveState();
          consumed = local.eligible;
          nextAt = local.nextAt;
          lastAt = localNow;
        }
      } else {
        const local = readLocalReviveState();
        if (local.eligible) {
          consumed = true;
        } else {
          consumed = false;
          nextAt = local.nextAt;
        }
      }

      if (!consumed) {
        setReviveEligible(false);
        setReviveNextAt(nextAt);
        setReviveError("Revive is on cooldown. Available once every 24h.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(reviveCooldownKey, String(lastAt));
      }
      setReviveEligible(false);
      setReviveNextAt(nextAt);
      setShared(true);
      setTimeout(() => setRevived(true), 1200);
    } catch {
      setReviveError("Share failed. Please try again.");
    } finally {
      setIsSharing(false);
    }
  }, [
    badges,
    composeCast,
    getQuickAuthToken,
    isSharing,
    ogUrl,
    readLocalReviveState,
    reviveCooldownKey,
    reviveEligible,
    reviveStatusLoading,
    stats.score,
  ]);

  const reviveCooldownText =
    reviveNextAt && reviveNextAt > nowTs
      ? `Revive available in ${formatTimeLeft(reviveNextAt - nowTs)}`
      : null;

  if (revived) {
    onRevive();
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
        <>
          <button
            onClick={handleShare}
            disabled={isSharing || reviveStatusLoading || !reviveEligible}
            className="w-full max-w-xs py-3.5 px-6 rounded-2xl font-black text-white text-base mb-2 shadow-lg shadow-purple-500/25 transition-transform disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
            style={{
              background: reviveEligible
                ? "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)"
                : "linear-gradient(135deg, #3f3f46 0%, #27272a 100%)",
            }}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <KittyIcon size={18} />
              {isSharing
                ? "Sharing..."
                : reviveStatusLoading
                  ? "Checking revive..."
                : "Share to Revive!"}
            </span>
          </button>
          {reviveCooldownText && (
            <p className="text-xs text-zinc-300 mb-2">{reviveCooldownText}</p>
          )}
          {reviveError && (
            <p className="text-xs text-rose-300 mb-2 text-center">{reviveError}</p>
          )}
        </>
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
        Season 1 prize pool: 10,000 $DEGEN for Top 3 players.
      </p>
    </div>
  );
}
