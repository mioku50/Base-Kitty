import { NextRequest, NextResponse } from "next/server";
import { verifyQuickAuthFromRequest } from "../../../../lib/server/farcasterAuth";
import { ensureScoresTable, getSqlClient } from "../../../../lib/server/storage";

export const runtime = "nodejs";

const REVIVE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(payload, { ...init, headers });
}

export async function GET(req: NextRequest) {
  const auth = await verifyQuickAuthFromRequest(req);
  if (!auth.ok) {
    return noStoreJson({ error: auth.error }, { status: auth.status });
  }

  try {
    const sql = getSqlClient();
    await ensureScoresTable(sql);

    const rows = (await sql`
      SELECT last_revive_at
      FROM scores
      WHERE fid = ${auth.fid}
      LIMIT 1
    `) as Array<{ last_revive_at: number | string | null }>;

    const lastReviveAt = Number(rows[0]?.last_revive_at ?? 0) || 0;
    const now = Date.now();
    const nextReviveAt = lastReviveAt > 0 ? lastReviveAt + REVIVE_COOLDOWN_MS : 0;
    const eligible = nextReviveAt <= now;

    return noStoreJson({
      fid: auth.fid,
      eligible,
      cooldownMs: REVIVE_COOLDOWN_MS,
      lastReviveAt: lastReviveAt || null,
      nextReviveAt: eligible ? null : nextReviveAt,
      remainingMs: eligible ? 0 : Math.max(0, nextReviveAt - now),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Revive status unavailable";
    const status = message.includes("DATABASE_URL is not configured") ? 500 : 400;
    return noStoreJson({ error: message }, { status });
  }
}
