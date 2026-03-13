import { NextRequest, NextResponse } from "next/server";
import {
  buildSignedClaim,
  calculateClaimEconomics,
  claimCooldownSeconds,
  estimateClaimGas,
  getBaseChainId,
  getClaimTxTarget,
  getCurrentGasPriceWei,
  getNextClaimAt,
  getRewardAmountRaw,
  getRewardLabel,
  isAddressLike,
  isRunWithin24Hours,
} from "../../../../lib/server/claim";
import { verifyQuickAuthFromRequest } from "../../../../lib/server/farcasterAuth";
import { ensureScoresTable, getSqlClient } from "../../../../lib/server/storage";

export const runtime = "nodejs";

type ClaimReason =
  | "play_required"
  | "cooldown"
  | "gas_too_high"
  | "price_unavailable"
  | "wallet_required";

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(payload, { ...init, headers });
}

function claimError(
  reason: ClaimReason,
  error: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return noStoreJson(
    {
      reason,
      error,
      ...extra,
    },
    { status }
  );
}

export async function POST(req: NextRequest) {
  const auth = await verifyQuickAuthFromRequest(req);
  if (!auth.ok) {
    return noStoreJson({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return noStoreJson({ error: "Invalid JSON body" }, { status: 400 });
  }

  const walletRaw =
    body && typeof body === "object" ? (body as Record<string, unknown>).address : undefined;
  const walletAddress = typeof walletRaw === "string" && isAddressLike(walletRaw)
    ? walletRaw
    : null;

  if (!walletAddress) {
    return claimError("wallet_required", "Wallet address is required", 400);
  }

  try {
    const sql = getSqlClient();
    await ensureScoresTable(sql);
    const scoreRows = (await sql`
      SELECT last_played_at
      FROM scores
      WHERE fid = ${auth.fid}
      LIMIT 1
    `) as Array<{ last_played_at: number | string | null }>;

    const lastPlayedAt = Number(scoreRows[0]?.last_played_at ?? 0) || null;
    if (!isRunWithin24Hours(lastPlayedAt)) {
      return claimError("play_required", "Play a run first", 409, {
        rewardLabel: getRewardLabel(),
        lastPlayedAt,
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const nextClaimAt = await getNextClaimAt(walletAddress);
    if (nextClaimAt > nowSec) {
      return claimError("cooldown", "Daily claim is on cooldown", 409, {
        nextClaimAt,
        cooldownSeconds: claimCooldownSeconds(),
      });
    }

    const signedClaim = await buildSignedClaim(walletAddress);
    const gasEstimate = await estimateClaimGas(walletAddress, signedClaim.calldata);
    const gasPriceWei = await getCurrentGasPriceWei();

    let economics;
    try {
      economics = await calculateClaimEconomics({ gasEstimate, gasPriceWei });
    } catch {
      return claimError("price_unavailable", "Reward/gas pricing unavailable", 503);
    }

    if (economics.estimatedGasUsd >= economics.rewardUsd) {
      return claimError("gas_too_high", "Gas cost is higher than reward value", 409, {
        estimatedGasUsd: economics.estimatedGasUsd,
        rewardUsd: economics.rewardUsd,
      });
    }

    return noStoreJson({
      fid: auth.fid,
      rewardLabel: getRewardLabel(),
      rewardAmountRaw: getRewardAmountRaw().toString(),
      tx: {
        to: getClaimTxTarget(),
        data: signedClaim.calldata,
        value: "0x0",
        chainIdHex: `0x${getBaseChainId().toString(16)}`,
      },
      voucher: {
        ...signedClaim.voucher,
        amount: signedClaim.voucher.amount.toString(),
        validAfter: signedClaim.voucher.validAfter.toString(),
        validBefore: signedClaim.voucher.validBefore.toString(),
        nonce: signedClaim.voucher.nonce.toString(),
        signature: signedClaim.signature,
      },
      economics: {
        rewardUsd: economics.rewardUsd,
        estimatedGasUsd: economics.estimatedGasUsd,
        gasEstimate: gasEstimate.toString(),
        gasPriceWei: gasPriceWei.toString(),
        ethUsd: economics.ethUsd,
        degenUsd: economics.degenUsd,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Claim preparation failed";
    const status =
      message.includes("DATABASE_URL is not configured") ||
      message.includes("is not configured")
        ? 500
        : 400;
    return noStoreJson({ error: message }, { status });
  }
}
