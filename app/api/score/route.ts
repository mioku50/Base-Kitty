import { NextRequest, NextResponse } from "next/server";

// In-memory leaderboard (replace with DB in production)
interface ScoreEntry {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  score: number;
  timestamp: number;
}

const scores: ScoreEntry[] = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, username, displayName, pfpUrl, score } = body;

    if (!fid || typeof score !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Upsert: keep only the highest score per fid
    const existing = scores.find((s) => s.fid === fid);
    if (existing) {
      if (score > existing.score) {
        existing.score = score;
        existing.timestamp = Date.now();
        existing.username = username || existing.username;
        existing.displayName = displayName || existing.displayName;
        existing.pfpUrl = pfpUrl || existing.pfpUrl;
      }
    } else {
      scores.push({
        fid,
        username: username || `fid:${fid}`,
        displayName: displayName || `User ${fid}`,
        pfpUrl: pfpUrl || "",
        score,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function GET() {
  // Return top 20 sorted by score descending
  const sorted = [...scores].sort((a, b) => b.score - a.score).slice(0, 20);
  const leaderboard = sorted.map((entry, i) => ({
    rank: i + 1,
    fid: entry.fid,
    username: entry.username,
    displayName: entry.displayName,
    pfpUrl: entry.pfpUrl,
    score: entry.score,
  }));

  return NextResponse.json({ leaderboard });
}
