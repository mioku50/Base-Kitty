import { NextRequest } from "next/server";
import { APP_NAME } from "~/lib/constants";
import {
  deleteUserNotificationDetails,
  setUserNotificationDetails,
} from "~/lib/kv";
import { sendMiniAppNotification } from "~/lib/notifs";

type NotificationDetails = {
  url: string;
  token: string;
};

type WebhookEvent =
  | { event: "miniapp_added"; notificationDetails?: NotificationDetails }
  | { event: "miniapp_removed" }
  | { event: "notifications_enabled"; notificationDetails: NotificationDetails }
  | { event: "notifications_disabled" };

type WebhookPayload = {
  fid: number;
  event: WebhookEvent;
};

function isNotificationDetails(value: unknown): value is NotificationDetails {
  if (!value || typeof value !== "object") {
    return false;
  }

  const details = value as Record<string, unknown>;
  return typeof details.url === "string" && typeof details.token === "string";
}

function parseWebhookPayload(input: unknown): WebhookPayload | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const payload = input as Record<string, unknown>;
  if (typeof payload.fid !== "number" || !payload.event || typeof payload.event !== "object") {
    return null;
  }

  const event = payload.event as Record<string, unknown>;

  switch (event.event) {
    case "miniapp_added": {
      const details = event.notificationDetails;
      if (details === undefined) {
        return { fid: payload.fid, event: { event: "miniapp_added" } };
      }

      if (!isNotificationDetails(details)) {
        return null;
      }

      return {
        fid: payload.fid,
        event: { event: "miniapp_added", notificationDetails: details },
      };
    }
    case "miniapp_removed":
      return { fid: payload.fid, event: { event: "miniapp_removed" } };
    case "notifications_enabled": {
      const details = event.notificationDetails;
      if (!isNotificationDetails(details)) {
        return null;
      }

      return {
        fid: payload.fid,
        event: { event: "notifications_enabled", notificationDetails: details },
      };
    }
    case "notifications_disabled":
      return { fid: payload.fid, event: { event: "notifications_disabled" } };
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  // If Neynar is enabled, we don't need to handle webhooks here
  // as they will be handled by Neynar's webhook endpoint
  const neynarEnabled = process.env.NEYNAR_API_KEY && process.env.NEYNAR_CLIENT_ID;
  if (neynarEnabled) {
    return Response.json({ success: true });
  }

  const requestJson = await request.json();
  const parsed = parseWebhookPayload(requestJson);

  if (!parsed) {
    console.error("Invalid webhook payload");
    return Response.json(
      { success: false, error: "Invalid webhook payload" },
      { status: 400 }
    );
  }

  const { fid, event } = parsed;

  // Only handle notifications if Neynar is not enabled
  // When Neynar is enabled, notifications are handled through their webhook
  switch (event.event) {
    case "miniapp_added":
      if (event.notificationDetails) {
        await setUserNotificationDetails(fid, event.notificationDetails);
        await sendMiniAppNotification({
          fid,
          title: `Welcome to ${APP_NAME}`,
          body: "Mini app is now added to your client",
        });
      } else {
        await deleteUserNotificationDetails(fid);
      }
      break;

    case "miniapp_removed":
      await deleteUserNotificationDetails(fid);
      break;

    case "notifications_enabled":
      await setUserNotificationDetails(fid, event.notificationDetails);
      await sendMiniAppNotification({
        fid,
        title: `Welcome to ${APP_NAME}`,
        body: "Notifications are now enabled",
      });
      break;

    case "notifications_disabled":
      await deleteUserNotificationDetails(fid);
      break;
  }

  return Response.json({ success: true });
}
