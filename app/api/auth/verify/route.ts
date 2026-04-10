import { NextRequest, NextResponse } from "next/server";
import {
  issueWalletSessionToken,
  verifyQuickAuthFromRequest,
  verifyWalletSignInRequest,
} from "../../../../lib/server/farcasterAuth";
import {
  ensureWalletIdentityTable,
  getOrCreateWalletIdentity,
  getSqlClient,
} from "../../../../lib/server/storage";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const auth = await verifyQuickAuthFromRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (auth.authType === "wallet") {
      return NextResponse.json({
        token: auth.token,
        user: {
          fid: auth.fid,
          walletAddress: auth.walletAddress,
          username: auth.username,
          displayName: auth.displayName,
          pfpUrl: auth.pfpUrl,
          authType: "wallet",
        },
      });
    }

    try {
      const fid = auth.fid;
      // Optionally fetch user profile from Neynar
      let user = {
        fid,
        username: undefined as string | undefined,
        displayName: undefined as string | undefined,
        pfpUrl: undefined as string | undefined,
        authType: "farcaster" as const,
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
                authType: "farcaster",
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

  try {
    const body = (await req.json().catch(() => ({}))) as {
      address?: string;
      message?: string;
      signature?: string;
    };
    const signedIn = await verifyWalletSignInRequest(req, body);
    if (!signedIn.ok) {
      return NextResponse.json(
        { error: signedIn.error },
        { status: signedIn.status }
      );
    }

    const sql = getSqlClient();
    await ensureWalletIdentityTable(sql);
    const identity = await getOrCreateWalletIdentity(sql, signedIn.walletAddress);
    const token = issueWalletSessionToken({
      fid: identity.fid,
      walletAddress: identity.walletAddress,
      username: identity.username,
      displayName: identity.displayName,
      pfpUrl: identity.pfpUrl,
    });

    return NextResponse.json({
      token,
      user: {
        fid: identity.fid,
        walletAddress: identity.walletAddress,
        username: identity.username,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl,
        authType: "wallet",
      },
    });
  } catch (err: unknown) {
    console.error("[auth/verify] wallet sign-in failed:", err);
    return NextResponse.json({ error: "Wallet sign-in failed" }, { status: 500 });
  }
}
