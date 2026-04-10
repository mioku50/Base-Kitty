import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type JWTPayload } from "@farcaster/quick-auth";
import { verifyMessage } from "viem";
import { NextRequest } from "next/server";
import {
  normalizeHexAddress,
  parseWalletSignInMessage,
  type HexAddress,
} from "../shared/walletAuth";

const quickAuthClient = createClient();
const WALLET_TOKEN_VERSION = "bk1";
const WALLET_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const WALLET_SIGNIN_MAX_AGE_SECONDS = 15 * 60;

type WalletSessionPayload = {
  v: 1;
  fid: number;
  walletAddress: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getWalletAuthSecret(): string {
  const secret =
    process.env.APP_AUTH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_AUTH_SECRET is not configured");
  }
  return "dev-only-wallet-auth-secret-change-me";
}

function signWalletTokenPayload(payloadB64: string): string {
  const secret = getWalletAuthSecret();
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function parseWalletSessionToken(token: string): WalletSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  if (parts[0] !== WALLET_TOKEN_VERSION) return null;

  const payloadB64 = parts[1];
  const signature = parts[2];
  if (!payloadB64 || !signature) return null;

  let expectedSig = "";
  try {
    expectedSig = signWalletTokenPayload(payloadB64);
  } catch {
    return null;
  }
  const sigBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSig);
  if (sigBytes.length !== expectedBytes.length) return null;
  if (!timingSafeEqual(sigBytes, expectedBytes)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as WalletSessionPayload;
    if (payload?.v !== 1) return null;
    if (!Number.isInteger(payload.fid) || payload.fid <= 0) return null;
    if (!normalizeHexAddress(payload.walletAddress)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.exp) || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function issueWalletSessionToken(input: {
  fid: number;
  walletAddress: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number.isFinite(input.ttlSeconds) && (input.ttlSeconds ?? 0) > 0
    ? Math.floor(input.ttlSeconds as number)
    : WALLET_TOKEN_TTL_SECONDS;
  const payload: WalletSessionPayload = {
    v: 1,
    fid: input.fid,
    walletAddress: normalizeHexAddress(input.walletAddress) ?? input.walletAddress.toLowerCase(),
    username: input.username,
    displayName: input.displayName,
    pfpUrl: input.pfpUrl,
    iat: now,
    exp: now + ttl,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signWalletTokenPayload(payloadB64);
  return `${WALLET_TOKEN_VERSION}.${payloadB64}.${signature}`;
}

export function getVerificationDomain(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.headers.get("host")?.split(",")[0]?.trim();

  if (host) {
    return host.replace(/:\d+$/, "").toLowerCase();
  }

  const deploymentHost = req.headers.get("x-vercel-deployment-url")?.trim();
  if (deploymentHost) {
    return deploymentHost.replace(/:\d+$/, "").toLowerCase();
  }

  if (process.env.NEXT_PUBLIC_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_URL).hostname.toLowerCase();
    } catch {
      // Fall through.
    }
  }

  return "localhost";
}

export async function verifyWalletSignInRequest(
  req: NextRequest,
  input: {
    address?: string;
    message?: string;
    signature?: string;
  }
): Promise<
  | { ok: true; walletAddress: HexAddress }
  | { ok: false; status: number; error: string }
> {
  const walletAddress = normalizeHexAddress(input.address);
  if (!walletAddress) {
    return { ok: false, status: 400, error: "Invalid wallet address" };
  }

  const message = (input.message || "").trim();
  const signature = (input.signature || "").trim();
  if (!message || !signature) {
    return { ok: false, status: 400, error: "Missing signature payload" };
  }
  if (!/^0x[a-fA-F0-9]+$/.test(signature)) {
    return { ok: false, status: 400, error: "Invalid wallet signature" };
  }

  const parsed = parseWalletSignInMessage(message);
  if (!parsed) {
    return { ok: false, status: 400, error: "Invalid sign-in message format" };
  }

  const expectedDomain = getVerificationDomain(req);
  if (parsed.domain !== expectedDomain) {
    return { ok: false, status: 401, error: "Sign-in domain mismatch" };
  }

  if ((normalizeHexAddress(parsed.address) || "").toLowerCase() !== walletAddress) {
    return { ok: false, status: 401, error: "Signed address mismatch" };
  }

  const issuedAtMs = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return { ok: false, status: 400, error: "Invalid issued-at timestamp" };
  }
  const ageSeconds = Math.floor((Date.now() - issuedAtMs) / 1000);
  if (ageSeconds < -60 || ageSeconds > WALLET_SIGNIN_MAX_AGE_SECONDS) {
    return { ok: false, status: 401, error: "Sign-in request expired" };
  }

  let valid = false;
  try {
    valid = await verifyMessage({
      address: walletAddress,
      message,
      signature: signature as HexAddress,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    return { ok: false, status: 401, error: "Invalid wallet signature" };
  }

  return { ok: true, walletAddress };
}

export type QuickAuthVerified = {
  ok: true;
  fid: number;
  token: string;
  payload?: JWTPayload;
  authType: "farcaster" | "wallet";
  walletAddress?: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
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

  const walletPayload = parseWalletSessionToken(token);
  if (walletPayload) {
    return {
      ok: true,
      fid: walletPayload.fid,
      token,
      authType: "wallet",
      walletAddress: walletPayload.walletAddress,
      username: walletPayload.username,
      displayName: walletPayload.displayName,
      pfpUrl: walletPayload.pfpUrl,
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
      authType: "farcaster",
    };
  } catch {
    return {
      ok: false,
      status: 401,
      error: "Invalid token",
    };
  }
}
