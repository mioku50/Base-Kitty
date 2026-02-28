import { MiniAppNotificationDetails } from '@farcaster/miniapp-sdk';
import { APP_NAME } from './constants';

const DISABLE_KV = process.env.DISABLE_KV === 'true';

// Explicitly enabled local development storage (non-persistent)
const localStore = new Map<string, MiniAppNotificationDetails>();

function assertKvConfigured() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    throw new Error(
      'KV is enabled but not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN, or set DISABLE_KV=true to explicitly disable KV.'
    );
  }
}

async function upstashGet<T>(key: string): Promise<T | null> {
  assertKvConfigured();
  const response = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`KV get failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { result: T | null };
  return payload.result;
}

async function upstashSet(key: string, value: MiniAppNotificationDetails): Promise<void> {
  assertKvConfigured();
  const response = await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`KV set failed with status ${response.status}`);
  }
}

async function upstashDelete(key: string): Promise<void> {
  assertKvConfigured();
  const response = await fetch(`${process.env.KV_REST_API_URL}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`KV delete failed with status ${response.status}`);
  }
}

function getUserNotificationDetailsKey(fid: number): string {
  return `${APP_NAME}:user:${fid}`;
}

export async function getUserNotificationDetails(
  fid: number
): Promise<MiniAppNotificationDetails | null> {
  const key = getUserNotificationDetailsKey(fid);
  if (DISABLE_KV) {
    return localStore.get(key) || null;
  }

  return upstashGet<MiniAppNotificationDetails>(key);
}

export async function setUserNotificationDetails(
  fid: number,
  notificationDetails: MiniAppNotificationDetails
): Promise<void> {
  const key = getUserNotificationDetailsKey(fid);
  if (DISABLE_KV) {
    localStore.set(key, notificationDetails);
    return;
  }

  await upstashSet(key, notificationDetails);
}

export async function deleteUserNotificationDetails(
  fid: number
): Promise<void> {
  const key = getUserNotificationDetailsKey(fid);
  if (DISABLE_KV) {
    localStore.delete(key);
    return;
  }

  await upstashDelete(key);
}
