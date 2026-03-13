import { createClient, type JWTPayload } from "@farcaster/quick-auth";
import { NextRequest } from "next/server";

const quickAuthClient = createClient();

export function getVerificationDomain(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host")?.split(",")[0]?.trim();

  if (host) {
    return host.replace(/:\d+$/, "");
  }

  const deploymentHost = req.headers.get("x-vercel-deployment-url")?.trim();
  if (deploymentHost) {
    return deploymentHost.replace(/:\d+$/, "");
  }

  if (process.env.NEXT_PUBLIC_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_URL).hostname;
    } catch {
      // Fall through.
    }
  }

  return "localhost";
}

export type QuickAuthVerified = {
  ok: true;
  fid: number;
  token: string;
  payload: JWTPayload;
};

export type QuickAuthRejected = {
  ok: false;
  status: number;
  error: string;
};

export type QuickAuthResult = QuickAuthVerified | QuickAuthRejected;

export async function verifyQuickAuthFromRequest(req: NextRequest): Promise<QuickAuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      status: 401,
      error: "Missing token",
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Missing token",
    };
  }

  try {
    const payload = await quickAuthClient.verifyJwt({
      token,
      domain: getVerificationDomain(req),
    });

    const fid = Number(payload.sub);
    if (!Number.isFinite(fid) || fid <= 0) {
      return {
        ok: false,
        status: 401,
        error: "Invalid token subject",
      };
    }

    return {
      ok: true,
      fid,
      token,
      payload,
    };
  } catch {
    return {
      ok: false,
      status: 401,
      error: "Invalid token",
    };
  }
}
