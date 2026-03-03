import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

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
}

function withNoStoreHeaders(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return { ...init, headers };
}

let tableEnsured = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureTable(sql: (strings: TemplateStringsArray, ...values: any[]) => Promise<any>) {
  if (tableEnsured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS scores (
      fid INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      pfp_url TEXT NOT NULL DEFAULT '',
      best_score INTEGER NOT NULL DEFAULT 0,
      weekly_score INTEGER NOT NULL DEFAULT 0,
      week_key TEXT NOT NULL DEFAULT '',
      enemies_killed INTEGER NOT NULL DEFAULT 0,
      coins_collected INTEGER NOT NULL DEFAULT 0,
      max_stage INTEGER NOT NULL DEFAULT 0,
      prayers_used INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 1,
      timestamp BIGINT NOT NULL DEFAULT 0
    )
  `;
  tableEnsured = true;
}

function currentWeekKey(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ─── POST: submit score ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      withNoStoreHeaders({ status: 500 })
    );
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await ensureTable(sql);

    const body = await req.json();
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
    } = body;

    if (!fid || typeof score !== "number") {
      return NextResponse.json(
        { error: "Invalid payload" },
        withNoStoreHeaders({ status: 400 })
      );
    }

    const wk = currentWeekKey();
    const now = Date.now();

    const rows = await sql`
      INSERT INTO scores
        (fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
         enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp)
      VALUES
        (${fid}, ${username || `fid:${fid}`}, ${displayName || `User ${fid}`},
         ${pfpUrl || ""}, ${score}, ${score}, ${wk},
         ${enemiesKilled}, ${coinsCollected}, ${maxStage}, ${prayersUsed}, 1, ${now})
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
        timestamp      = CASE
                           WHEN ${score} > scores.best_score THEN ${now}
                           ELSE scores.timestamp
                         END
      RETURNING best_score, weekly_score, week_key, enemies_killed, coins_collected,
                max_stage, prayers_used, games_played, timestamp
    `;

    const row = rows[0];
    const entry: ScoreEntry = {
      fid,
      username: username || `fid:${fid}`,
      displayName: displayName || `User ${fid}`,
      pfpUrl: pfpUrl || "",
      bestScore: row.best_score,
      weeklyScore: row.weekly_score,
      weekKey: row.week_key,
      enemiesKilled: row.enemies_killed,
      coinsCollected: row.coins_collected,
      maxStage: row.max_stage,
      prayersUsed: row.prayers_used,
      gamesPlayed: row.games_played,
      timestamp: Number(row.timestamp),
    };

    return NextResponse.json(
      {
        ok: true,
        bestScore: entry.bestScore,
        badges: deriveBadges(entry),
        storage: "neon",
      },
      withNoStoreHeaders()
    );
  } catch {
    return NextResponse.json(
      { error: "Bad request" },
      withNoStoreHeaders({ status: 400 })
    );
  }
}

// ─── GET: leaderboard ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      withNoStoreHeaders({ status: 500 })
    );
  }

  const sql = neon(process.env.DATABASE_URL);
  await ensureTable(sql);

  const modeParam = req.nextUrl.searchParams.get("mode");
  const mode = modeParam === "alltime" || modeParam === "friends" ? modeParam : "weekly";
  const fidParam = req.nextUrl.searchParams.get("fid");
  const friendFidsParam = req.nextUrl.searchParams.get("friends"); // comma-separated

  const wk = currentWeekKey();
  let rows: Record<string, unknown>[];

  if (mode === "weekly") {
    rows = await sql`
      SELECT fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
             enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp
      FROM scores
      WHERE week_key = ${wk}
      ORDER BY weekly_score DESC
      LIMIT 50
    `;
  } else if (mode === "friends") {
    const friendFids = friendFidsParam
      ? friendFidsParam.split(",").map(Number).filter(Boolean)
      : [];
    if (fidParam) friendFids.push(Number(fidParam));
    const uniqueFriendFids = [...new Set(friendFids)];

    if (uniqueFriendFids.length === 0) {
      rows = [];
    } else {
      rows = await sql`
        SELECT fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
               enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp
        FROM scores
        WHERE fid = ANY(${uniqueFriendFids})
        ORDER BY best_score DESC
        LIMIT 50
      `;
    }
  } else {
    // alltime
    rows = await sql`
      SELECT fid, username, display_name, pfp_url, best_score, weekly_score, week_key,
             enemies_killed, coins_collected, max_stage, prayers_used, games_played, timestamp
      FROM scores
      ORDER BY best_score DESC
      LIMIT 50
    `;
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
