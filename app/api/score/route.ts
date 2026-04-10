import { NextRequest, NextResponse } from "next/server";
import {
  ensureRewardTables,
  ensureScoresTable,
  getSqlClient,
} from "../../../lib/server/storage";
import { verifyQuickAuthFromRequest } from "../../../lib/server/farcasterAuth";

export const runtime = "nodejs";

// ─── Types ─────────────────────────────────────────────────────────────────
export interface ScoreEntry {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  bestScore: number;
  weeklyScore: number;
  weekKey: string;          // e.g. "2026-W09"
  enemiesKilled: number;
  coinsCollected: number;
  maxStage: number;
  prayersUsed: number;
  gamesPlayed: number;
  timestamp: number;
  lastPlayedAt: number;
}

type ScoreRow = {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
  best_score: number;
  weekly_score: number;
  week_key: string;
  enemies_killed: number;
  coins_collected: number;
  max_stage: number;
  prayers_used: number;
  games_played: number;
  timestamp: number | string;
  last_played_at: number | string;
  last_run_items_collected: number;
};

function withNoStoreHeaders(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return { ...init, headers };
}

function currentWeekKey(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function utcDayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function isPreviousUtcDay(previousDay: string, currentDay: string): boolean {
  const prevTime = Date.parse(`${previousDay}T00:00:00.000Z`);
  const currTime = Date.parse(`${currentDay}T00:00:00.000Z`);
  if (!Number.isFinite(prevTime) || !Number.isFinite(currTime)) return false;
  return currTime - prevTime === 86400000;
}

// ─── POST: submit score ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const sql = getSqlClient();
    await ensureScoresTable(sql);
    await ensureRewardTables(sql);

    const body = await req.json();
    const hasAuthHeader = req.headers.get("authorization")?.startsWith("Bearer ");
    const auth = hasAuthHeader ? await verifyQuickAuthFromRequest(req) : null;
    if (hasAuthHeader && auth && !auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        withNoStoreHeaders({ status: auth.status })
      );
    }
    const {
      fid,
      username,
      displayName,
      pfpUrl,
      score,
      enemiesKilled = 0,
      coinsCollected = 0,
      maxStage = 0,
      prayersUsed = 0,
      referrerFid,
    } = body;

    const resolvedFid = auth && auth.ok ? auth.fid : Number(fid);
    const resolvedUsername =
      (auth && auth.ok && auth.username) || username || `fid:${resolvedFid}`;
    const resolvedDisplayName =
      (auth && auth.ok && auth.displayName) || displayName || `User ${resolvedFid}`;
    const resolvedPfpUrl = (auth && auth.ok && auth.pfpUrl) || pfpUrl || "";

    if (!resolvedFid || typeof score !== "number") {
      return NextResponse.json(
        { error: "Invalid payload" },
        withNoStoreHeaders({ status: 400 })
      );
    }

    const wk = currentWeekKey();
    const now = Date.now();
    const dayKey = utcDayKey(now);

    const rows = (await sql`
      INSERT INTO scores
        (fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
         enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp, last_played_at, last_run_items_collected)
      VALUES
        (${resolvedFid}, ${resolvedUsername}, ${resolvedDisplayName},
         ${resolvedPfpUrl}, ${score}, ${score}, ${wk},
         ${enemiesKilled}, ${coinsCollected}, ${maxStage}, ${prayersUsed}, 1, ${now}, ${now}, ${coinsCollected})
      ON CONFLICT (fid) DO UPDATE SET
        username       = EXCLUDED.username,
        display_name   = EXCLUDED.display_name,
        pfp_url        = EXCLUDED.pfp_url,
        best_score     = GREATEST(scores.best_score, EXCLUDED.best_score),
        weekly_score   = CASE
                           WHEN scores.week_key <> ${wk} THEN ${score}
                           ELSE GREATEST(scores.weekly_score, ${score})
                         END,
        week_key       = ${wk},
        enemies_killed  = scores.enemies_killed + ${enemiesKilled},
        coins_collected = scores.coins_collected + ${coinsCollected},
        max_stage      = GREATEST(scores.max_stage, ${maxStage}),
        prayers_used   = scores.prayers_used + ${prayersUsed},
        games_played   = scores.games_played + 1,
        last_played_at = ${now},
        last_run_items_collected = ${coinsCollected},
        timestamp      = CASE
                           WHEN ${score} > scores.best_score THEN ${now}
                           ELSE scores.timestamp
                         END
      RETURNING best_score, weekly_score, week_key, enemies_killed, coins_collected,
                max_stage, prayers_used, games_played, timestamp, last_played_at, last_run_items_collected
    `) as ScoreRow[];

    const row = rows[0];
    const entry: ScoreEntry = {
      fid: resolvedFid,
      username: resolvedUsername,
      displayName: resolvedDisplayName,
      pfpUrl: resolvedPfpUrl,
      bestScore: row.best_score,
      weeklyScore: row.weekly_score,
      weekKey: row.week_key,
      enemiesKilled: row.enemies_killed,
      coinsCollected: row.coins_collected,
      maxStage: row.max_stage,
      prayersUsed: row.prayers_used,
      gamesPlayed: row.games_played,
      timestamp: Number(row.timestamp),
      lastPlayedAt: Number(row.last_played_at),
    };

    // Update per-user streak based on unique UTC play days.
    const streakRows = (await sql`
      SELECT streak_days, last_play_day
      FROM player_streaks
      WHERE fid = ${resolvedFid}
      LIMIT 1
    `) as Array<{ streak_days: number; last_play_day: string }>;

    if (streakRows.length === 0) {
      await sql`
        INSERT INTO player_streaks (fid, streak_days, last_play_day, updated_at)
        VALUES (${resolvedFid}, 1, ${dayKey}, ${now})
        ON CONFLICT (fid) DO NOTHING
      `;
    } else {
      const prev = streakRows[0];
      if (prev.last_play_day !== dayKey) {
        const nextStreak = isPreviousUtcDay(prev.last_play_day, dayKey)
          ? Number(prev.streak_days || 0) + 1
          : 1;
        await sql`
          UPDATE player_streaks
          SET streak_days = ${nextStreak},
              last_play_day = ${dayKey},
              updated_at = ${now}
          WHERE fid = ${resolvedFid}
        `;
      }
    }

    // Capture referral only on user's first recorded game.
    const parsedReferrerFid =
      typeof referrerFid === "number" ? referrerFid : Number(referrerFid ?? 0);
    if (
      Number.isInteger(parsedReferrerFid) &&
      parsedReferrerFid > 0 &&
      parsedReferrerFid !== resolvedFid &&
      entry.gamesPlayed === 1
    ) {
      await sql`
        INSERT INTO referrals (referred_fid, referrer_fid, created_at, created_day)
        VALUES (${resolvedFid}, ${parsedReferrerFid}, ${now}, ${dayKey})
        ON CONFLICT (referred_fid) DO NOTHING
      `;
    }

    return NextResponse.json(
      {
        ok: true,
        bestScore: entry.bestScore,
        badges: deriveBadges(entry),
        storage: "neon",
      },
      withNoStoreHeaders()
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Score submission failed";
    const status =
      message.includes("DATABASE_URL is not configured") ? 500 : 400;
    return NextResponse.json(
      { error: message },
      withNoStoreHeaders({ status })
    );
  }
}

// ─── GET: leaderboard ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const sql = getSqlClient();
    await ensureScoresTable(sql);
    const modeParam = req.nextUrl.searchParams.get("mode");
    const mode = modeParam === "alltime" || modeParam === "friends" ? modeParam : "weekly";
    const fidParam = req.nextUrl.searchParams.get("fid");
    const friendFidsParam = req.nextUrl.searchParams.get("friends"); // comma-separated

    const wk = currentWeekKey();
    let rows: ScoreRow[];

    if (mode === "weekly") {
      rows = (await sql`
        SELECT fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
               enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp, last_played_at
        FROM scores
        WHERE week_key = ${wk}
        ORDER BY weekly_score DESC
        LIMIT 50
      `) as ScoreRow[];
    } else if (mode === "friends") {
      const friendFids = friendFidsParam
        ? friendFidsParam.split(",").map(Number).filter(Boolean)
        : [];
      if (fidParam) friendFids.push(Number(fidParam));
      const uniqueFriendFids = [...new Set(friendFids)];

      if (uniqueFriendFids.length === 0) {
        rows = [];
      } else {
        rows = (await sql`
          SELECT fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
                 enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp, last_played_at
          FROM scores
          WHERE fid = ANY(${uniqueFriendFids})
          ORDER BY best_score DESC
          LIMIT 50
        `) as ScoreRow[];
      }
    } else {
      // alltime
      rows = (await sql`
        SELECT fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
               enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp, last_played_at
        FROM scores
        ORDER BY best_score DESC
        LIMIT 50
      `) as ScoreRow[];
    }

    const leaderboard = rows.map((row, i) => {
      const entry: ScoreEntry = {
        fid: row.fid as number,
        username: row.username as string,
        displayName: row.display_name as string,
        pfpUrl: row.pfp_url as string,
        bestScore: row.best_score as number,
        weeklyScore: row.weekly_score as number,
        weekKey: row.week_key as string,
        enemiesKilled: row.enemies_killed as number,
        coinsCollected: row.coins_collected as number,
        maxStage: row.max_stage as number,
        prayersUsed: row.prayers_used as number,
        gamesPlayed: row.games_played as number,
        timestamp: Number(row.timestamp),
        lastPlayedAt: Number(row.last_played_at as number),
      };
      return {
        rank: i + 1,
        fid: entry.fid,
        username: entry.username,
        displayName: entry.displayName,
        pfpUrl: entry.pfpUrl,
        score: mode === "weekly" ? entry.weeklyScore : entry.bestScore,
        badges: deriveBadges(entry),
      };
    });

    return NextResponse.json(
      {
        leaderboard,
        mode,
        storage: "neon",
      },
      withNoStoreHeaders()
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Leaderboard unavailable";
    return NextResponse.json(
      { error: message },
      withNoStoreHeaders({ status: 500 })
    );
  }
}

// ─── Badge derivation ──────────────────────────────────────────────────────
function deriveBadges(e: ScoreEntry): string[] {
  const b: string[] = [];
  if (e.enemiesKilled >= 1) b.push(`Bear Slayer x${e.enemiesKilled}`);
  if (e.maxStage >= 1) b.push(`Stage ${e.maxStage + 1} Reached`);
  if (e.prayersUsed >= 1) b.push(`Prayer Warrior x${e.prayersUsed}`);
  if (e.coinsCollected >= 10) b.push(`Coin Maniac`);
  if (e.gamesPlayed >= 5) b.push(`Addicted Gamer`);
  if (e.bestScore >= 5000) b.push(`Onchain Legend`);
  if (e.bestScore >= 1000) b.push(`Cloud Master`);
  return b;
}
