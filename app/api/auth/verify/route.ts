import { NextRequest, NextResponse } from "next/server";
import { verifyQuickAuthFromRequest } from "../../../../lib/server/farcasterAuth";

export async function POST(req: NextRequest) {
  const auth = await verifyQuickAuthFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const fid = auth.fid;
    // Optionally fetch user profile from Neynar
    let user = {
      fid,
      username: undefined as string | undefined,
      displayName: undefined as string | undefined,
      pfpUrl: undefined as string | undefined,
    };

    const neynarKey = process.env.NEYNAR_API_KEY;
    if (neynarKey) {
      try {
        const res = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
          { headers: { accept: "application/json", "x-api-key": neynarKey } }
        );
        if (res.ok) {
          const data = await res.json();
          const neynarUser = data.users?.[0];
          if (neynarUser) {
            user = {
              fid,
              username: neynarUser.username,
              displayName: neynarUser.display_name,
              pfpUrl: neynarUser.pfp_url,
            };
          }
        }
      } catch {
        // Neynar fetch failed — return basic user
      }
    }

    return NextResponse.json({ user });
  } catch (err: unknown) {
    console.error("[auth/verify] profile enrichment failed:", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
