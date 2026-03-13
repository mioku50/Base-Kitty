import { NextRequest, NextResponse } from "next/server";
import { ensureNotificationTable, getSqlClient } from "../../../../lib/server/storage";

export const runtime = "nodejs";

type NotificationRow = {
  fid: number;
  notification_url: string;
  notification_token: string;
};

type NotificationResponse = {
  result?: {
    successfulTokens?: string[];
    invalidTokens?: string[];
    rateLimitedTokens?: string[];
  };
};

function withNoStoreHeaders(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return { ...init, headers };
}

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function appUrl() {
  const raw = process.env.NEXT_PUBLIC_URL?.trim() || "https://base-kitty.vercel.app";
  return raw.replace(/\/+$/, "");
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    return req.nextUrl.searchParams.get("secret") === secret;
  }

  if (process.env.NODE_ENV === "production") {
    return req.headers.get("x-vercel-cron") === "1";
  }

  return true;
}

async function sendNotification(
  row: NotificationRow,
  payload: {
    notificationId: string;
    title: string;
    body: string;
    targetUrl: string;
    tokens: string[];
  }
): Promise<"sent" | "invalid" | "rate_limited" | "failed"> {
  try {
    const response = await fetch(row.notification_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${row.notification_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return "failed";
    }

    const json = (await response.json()) as NotificationResponse;
    const successfulTokens = json.result?.successfulTokens ?? [];
    const invalidTokens = json.result?.invalidTokens ?? [];
    const rateLimitedTokens = json.result?.rateLimitedTokens ?? [];

    if (successfulTokens.includes(row.notification_token)) {
      return "sent";
    }
    if (invalidTokens.includes(row.notification_token)) {
      return "invalid";
    }
    if (rateLimitedTokens.includes(row.notification_token)) {
      return "rate_limited";
    }

    return "failed";
  } catch {
    return "failed";
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      withNoStoreHeaders({ status: 401 })
    );
  }

  try {
    const sql = getSqlClient();
    await ensureNotificationTable(sql);
    const today = utcDateKey();

    const rows = (await sql`
      SELECT fid, notification_url, notification_token
      FROM miniapp_notifications
      WHERE enabled = true
        AND notification_url <> ''
        AND notification_token <> ''
        AND COALESCE(last_notified_utc_date, '') <> ${today}
    `) as NotificationRow[];

    let attempted = 0;
    let sent = 0;
    let invalid = 0;
    let rateLimited = 0;
    let failed = 0;

    for (const row of rows) {
      attempted++;

      const result = await sendNotification(row, {
        notificationId: `daily-claim-${today}-${row.fid}`,
        title: "Go to Game and Claim $Degen",
        body: "Play once per day and claim your angel reward",
        targetUrl: appUrl(),
        tokens: [row.notification_token],
      });

      if (result === "sent") {
        sent++;
        await sql`
          UPDATE miniapp_notifications
          SET last_notified_utc_date = ${today},
              updated_at = ${Date.now()}
          WHERE fid = ${row.fid}
        `;
        continue;
      }

      if (result === "invalid") {
        invalid++;
        await sql`
          UPDATE miniapp_notifications
          SET enabled = false,
              updated_at = ${Date.now()}
          WHERE fid = ${row.fid}
        `;
        continue;
      }

      if (result === "rate_limited") {
        rateLimited++;
        continue;
      }

      failed++;
    }

    return NextResponse.json(
      {
        ok: true,
        date: today,
        attempted,
        sent,
        invalid,
        rateLimited,
        failed,
      },
      withNoStoreHeaders()
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Database unavailable";
    return NextResponse.json(
      { ok: false, error: message },
      withNoStoreHeaders({ status: 500 })
    );
  }
}
