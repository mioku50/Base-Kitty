import { NextRequest, NextResponse } from "next/server";
import type { SocialFriend } from "../../../lib/game/types";

const NEYNAR_TIMEOUT_MS = 6000;

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(payload, { ...init, headers });
}

export async function GET(req: NextRequest) {
  const fidsParam = req.nextUrl.searchParams.get("fids");
  if (!fidsParam) {
    return noStoreJson({ users: [] });
  }

  const neynarKey = process.env.NEYNAR_API_KEY;
  if (!neynarKey) {
    return noStoreJson({ users: [], error: "Neynar API key not configured" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEYNAR_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidsParam}`,
      {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "x-api-key": neynarKey,
        },
      }
    );

    if (!res.ok) {
      return noStoreJson({ users: [] });
    }

    const data = await res.json();
    const users: SocialFriend[] = (data.users || []).map(
      (u: { fid: number; username?: string; display_name?: string; pfp_url?: string }) => ({
        fid: u.fid,
        username: u.username || `fid:${u.fid}`,
        pfpUrl: u.pfp_url || "",
      })
    ).filter((u: SocialFriend) => u.pfpUrl);

    return noStoreJson({ users });
  } catch {
    return noStoreJson({ users: [] });
  } finally {
    clearTimeout(timeout);
  }
}
