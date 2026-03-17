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

export async function POST(req: NextRequest) {
  const auth = await verifyQuickAuthFromRequest(req);
  if (!auth.ok) {
    return noStoreJson({ error: auth.error }, { status: auth.status });
  }

  try {
    const sql = getSqlClient();
    await ensureScoresTable(sql);

    const now = Date.now();
    const cooldownThreshold = now - REVIVE_COOLDOWN_MS;

    const consumedRows = (await sql`
      INSERT INTO scores (fid, username, display_name, pfp_url, last_revive_at)
      VALUES (${auth.fid}, ${`fid:${auth.fid}`}, ${`User ${auth.fid}`}, '', ${now})
      ON CONFLICT (fid) DO UPDATE SET
        last_revive_at = EXCLUDED.last_revive_at
      WHERE COALESCE(scores.last_revive_at, 0) <= ${cooldownThreshold}
      RETURNING last_revive_at
    `) as Array<{ last_revive_at: number | string }>;

    if (consumedRows.length > 0) {
      const lastReviveAt = Number(consumedRows[0].last_revive_at) || now;
      return noStoreJson({
        ok: true,
        fid: auth.fid,
        consumed: true,
        cooldownMs: REVIVE_COOLDOWN_MS,
        lastReviveAt,
        nextReviveAt: lastReviveAt + REVIVE_COOLDOWN_MS,
      });
    }

    const currentRows = (await sql`
      SELECT last_revive_at
      FROM scores
      WHERE fid = ${auth.fid}
      LIMIT 1
    `) as Array<{ last_revive_at: number | string | null }>;

    const lastReviveAt = Number(currentRows[0]?.last_revive_at ?? 0) || now;
    const nextReviveAt = lastReviveAt + REVIVE_COOLDOWN_MS;

    return noStoreJson(
      {
        ok: false,
        consumed: false,
        reason: "cooldown",
        fid: auth.fid,
        cooldownMs: REVIVE_COOLDOWN_MS,
        lastReviveAt,
        nextReviveAt,
        remainingMs: Math.max(0, nextReviveAt - Date.now()),
      },
      { status: 409 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Revive consume failed";
    const status = message.includes("DATABASE_URL is not configured") ? 500 : 400;
    return noStoreJson({ error: message }, { status });
  }
}
