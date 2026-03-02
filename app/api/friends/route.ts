import { NextRequest, NextResponse } from "next/server";

const NEYNAR_TIMEOUT_MS = 6000;

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(payload, { ...init, headers });
}

export async function GET(req: NextRequest) {
  const fid = req.nextUrl.searchParams.get("fid");
  if (!fid) {
    return noStoreJson({ fids: [] });
  }

  const neynarKey = process.env.NEYNAR_API_KEY;
  if (!neynarKey) {
    return noStoreJson({ fids: [], error: "Neynar API key not configured" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NEYNAR_TIMEOUT_MS);

  try {
    // Fetch following list from Neynar
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/following?fid=${fid}&limit=100`,
      {
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "x-api-key": neynarKey,
        },
      }
    );

    if (!res.ok) {
      return noStoreJson({ fids: [] });
    }

    const data = await res.json();
    const fids: number[] = (data.users || []).map(
      (u: { user?: { fid?: number }; fid?: number }) => u.user?.fid ?? u.fid
    ).filter(Boolean);

    return noStoreJson({ fids });
  } catch {
    return noStoreJson({ fids: [] });
  } finally {
    clearTimeout(timeout);
  }
}
