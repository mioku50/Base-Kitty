import { NextRequest, NextResponse } from "next/server";

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

// ─── In-memory store (replace with DB in production) ───────────────────────
const store: ScoreEntry[] = [];

function currentWeekKey(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// ─── POST: submit score ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const wk = currentWeekKey();
    const existing = store.find((s) => s.fid === fid);

    if (existing) {
      existing.gamesPlayed++;
      existing.enemiesKilled += enemiesKilled;
      existing.coinsCollected += coinsCollected;
      existing.prayersUsed += prayersUsed;
      existing.maxStage = Math.max(existing.maxStage, maxStage);
      existing.username = username || existing.username;
      existing.displayName = displayName || existing.displayName;
      existing.pfpUrl = pfpUrl || existing.pfpUrl;

      if (score > existing.bestScore) {
        existing.bestScore = score;
        existing.timestamp = Date.now();
      }
      // Reset weekly if new week
      if (existing.weekKey !== wk) {
        existing.weekKey = wk;
        existing.weeklyScore = score;
      } else if (score > existing.weeklyScore) {
        existing.weeklyScore = score;
      }
    } else {
      store.push({
        fid,
        username: username || `fid:${fid}`,
        displayName: displayName || `User ${fid}`,
        pfpUrl: pfpUrl || "",
        bestScore: score,
        weeklyScore: score,
        weekKey: wk,
        enemiesKilled,
        coinsCollected,
        maxStage,
        prayersUsed,
        gamesPlayed: 1,
        timestamp: Date.now(),
      });
    }

    const entry = store.find((s) => s.fid === fid)!;
    return NextResponse.json({
      ok: true,
      bestScore: entry.bestScore,
      badges: deriveBadges(entry),
    });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// ─── GET: leaderboard ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") || "weekly";
  const fidParam = req.nextUrl.searchParams.get("fid");
  const friendFidsParam = req.nextUrl.searchParams.get("friends"); // comma-separated

  const wk = currentWeekKey();
  let pool = [...store];

  if (mode === "friends" && friendFidsParam) {
    const friendFids = friendFidsParam.split(",").map(Number).filter(Boolean);
    if (fidParam) friendFids.push(Number(fidParam));
    pool = pool.filter((s) => friendFids.includes(s.fid));
  }

  // Sort
  if (mode === "weekly") {
    pool = pool.filter((s) => s.weekKey === wk);
    pool.sort((a, b) => b.weeklyScore - a.weeklyScore);
  } else {
    pool.sort((a, b) => b.bestScore - a.bestScore);
  }

  const top = pool.slice(0, 50);
  const leaderboard = top.map((entry, i) => ({
    rank: i + 1,
    fid: entry.fid,
    username: entry.username,
    displayName: entry.displayName,
    pfpUrl: entry.pfpUrl,
    score: mode === "weekly" ? entry.weeklyScore : entry.bestScore,
    badges: deriveBadges(entry),
  }));

  return NextResponse.json({ leaderboard, mode });
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
