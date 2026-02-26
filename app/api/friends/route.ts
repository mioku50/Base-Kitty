import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const fid = req.nextUrl.searchParams.get("fid");
  if (!fid) {
    return NextResponse.json({ fids: [] });
  }

  const neynarKey = process.env.NEYNAR_API_KEY;
  if (!neynarKey) {
    return NextResponse.json({ fids: [], error: "Neynar API key not configured" });
  }

  try {
    // Fetch following list from Neynar
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/following?fid=${fid}&limit=100`,
      {
        headers: {
          accept: "application/json",
          "x-api-key": neynarKey,
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ fids: [] });
    }

    const data = await res.json();
    const fids: number[] = (data.users || []).map(
      (u: { user?: { fid?: number }; fid?: number }) => u.user?.fid ?? u.fid
    ).filter(Boolean);

    return NextResponse.json({ fids });
  } catch {
    return NextResponse.json({ fids: [] });
  }
}
