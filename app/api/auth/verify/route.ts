import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@farcaster/quick-auth";

const client = createClient();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const domain = process.env.NEXT_PUBLIC_URL
      ? new URL(process.env.NEXT_PUBLIC_URL).hostname
      : "localhost";

    const payload = await client.verifyJwt({ token, domain });
    const fid = Number(payload.sub);

    // Optionally fetch user profile from Neynar
    let user = { fid, username: undefined as string | undefined, displayName: undefined as string | undefined, pfpUrl: undefined as string | undefined };

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
  } catch (err) {
    console.error("[auth/verify] JWT verification failed:", err);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
