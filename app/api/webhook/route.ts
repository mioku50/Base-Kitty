import {
  ParseWebhookEvent,
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/miniapp-node";
import { NextRequest, NextResponse } from "next/server";

type NotificationDetails = {
  url: string;
  token: string;
};

// Serverless-safe, idempotent in-memory fallback for basic webhook handling.
// This is intentionally minimal and non-persistent for build stability.
const notificationDetailsByFid = new Map<number, NotificationDetails>();

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

function applyEvent(fid: number, eventName: string, notificationDetails?: unknown) {
  switch (eventName) {
    case "miniapp_added":
    case "notifications_enabled":
      if (isNotificationDetails(notificationDetails)) {
        notificationDetailsByFid.set(fid, notificationDetails);
      } else {
        notificationDetailsByFid.delete(fid);
      }
      break;
    case "miniapp_removed":
    case "notifications_disabled":
      notificationDetailsByFid.delete(fid);
      break;
    default:
      // Ignore unknown events but keep successful ack after signature verification.
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

  applyEvent(data.fid, eventName, notificationDetails);

  return NextResponse.json({
    success: true,
    event: eventName,
    storedNotificationUsers: notificationDetailsByFid.size,
  });
}
