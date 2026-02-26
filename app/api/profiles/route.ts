import { NextRequest, NextResponse } from "next/server";
import type { SocialFriend } from "../../../lib/game/types";

export async function GET(req: NextRequest) {
  const fidsParam = req.nextUrl.searchParams.get("fids");
  if (!fidsParam) {
    return NextResponse.json({ users: [] });
  }

  const neynarKey = process.env.NEYNAR_API_KEY;
  if (!neynarKey) {
    return NextResponse.json({ users: [], error: "Neynar API key not configured" });
  }

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidsParam}`,
      {
        headers: {
          accept: "application/json",
          "x-api-key": neynarKey,
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ users: [] });
    }

    const data = await res.json();
    const users: SocialFriend[] = (data.users || []).map(
      (u: { fid: number; username?: string; display_name?: string; pfp_url?: string }) => ({
        fid: u.fid,
        username: u.username || `fid:${u.fid}`,
        pfpUrl: u.pfp_url || "",
      })
    ).filter((u: SocialFriend) => u.pfpUrl);

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ users: [] });
  }
}
