import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/miniapp-node";
import { NextRequest, NextResponse } from "next/server";
import { ensureNotificationTable, getSqlClient } from "../../../lib/server/storage";

export const runtime = "nodejs";

type NotificationDetails = {
  url: string;
  token: string;
};

function isNotificationDetails(value: unknown): value is NotificationDetails {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.url === "string" &&
    candidate.url.length > 0 &&
    typeof candidate.token === "string" &&
    candidate.token.length > 0
  );
}

async function countEnabledNotifications() {
  const sql = getSqlClient();
  await ensureNotificationTable(sql);

  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM miniapp_notifications
    WHERE enabled = true
      AND notification_url <> ''
      AND notification_token <> ''
  `) as Array<{ count: number | string }>;

  return Number(rows[0]?.count ?? 0);
}

async function applyEvent(fid: number, eventName: string, notificationDetails?: unknown) {
  const sql = getSqlClient();
  await ensureNotificationTable(sql);
  const now = Date.now();

  switch (eventName) {
    case "miniapp_added":
    case "notifications_enabled": {
      if (isNotificationDetails(notificationDetails)) {
        await sql`
          INSERT INTO miniapp_notifications
            (fid, notification_url, notification_token, enabled, updated_at)
          VALUES
            (${fid}, ${notificationDetails.url}, ${notificationDetails.token}, true, ${now})
          ON CONFLICT (fid) DO UPDATE SET
            notification_url = EXCLUDED.notification_url,
            notification_token = EXCLUDED.notification_token,
            enabled = true,
            updated_at = EXCLUDED.updated_at
        `;
      } else {
        await sql`
          INSERT INTO miniapp_notifications
            (fid, enabled, updated_at)
          VALUES
            (${fid}, false, ${now})
          ON CONFLICT (fid) DO UPDATE SET
            enabled = false,
            updated_at = EXCLUDED.updated_at
        `;
      }
      break;
    }

    case "miniapp_removed":
    case "notifications_disabled": {
      await sql`
        INSERT INTO miniapp_notifications
          (fid, enabled, updated_at)
        VALUES
          (${fid}, false, ${now})
        ON CONFLICT (fid) DO UPDATE SET
          enabled = false,
          updated_at = EXCLUDED.updated_at
      `;
      break;
    }

    default:
      break;
  }
}

export async function POST(request: NextRequest) {
  let requestJson: unknown;
  try {
    requestJson = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  let data;
  try {
    data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
  } catch (e: unknown) {
    const error = e as ParseWebhookEvent.ErrorType;

    switch (error.name) {
      case "VerifyJsonFarcasterSignature.InvalidDataError":
      case "VerifyJsonFarcasterSignature.InvalidEventDataError":
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 400 }
        );
      case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 401 }
        );
      case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      default:
        return NextResponse.json(
          { success: false, error: "Webhook signature verification failed" },
          { status: 500 }
        );
    }
  }

  const eventName = data.event.event;
  const notificationDetails =
    "notificationDetails" in data.event ? data.event.notificationDetails : undefined;

  try {
    await applyEvent(data.fid, eventName, notificationDetails);
    const storedNotificationUsers = await countEnabledNotifications();

    return NextResponse.json({
      success: true,
      event: eventName,
      storedNotificationUsers,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Webhook persistence failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
