import { NextRequest, NextResponse } from "next/server";
import {
  buildSignedClaim,
  calculateClaimEconomics,
  estimateClaimGas,
  getRpcFriendlyErrorMessage,
  getCurrentGasPriceWei,
  getNextClaimAt,
  getRewardAmountRaw,
  getRewardLabel,
  isAddressLike,
  isRpcRateLimitError,
  isRunWithin24Hours,
} from "../../../../lib/server/claim";
import { verifyQuickAuthFromRequest } from "../../../../lib/server/farcasterAuth";
import { ensureScoresTable, getSqlClient } from "../../../../lib/server/storage";

export const runtime = "nodejs";

type ClaimReason =
  | "eligible"
  | "play_required"
  | "wallet_required"
  | "cooldown"
  | "gas_too_high"
  | "price_unavailable";

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(payload, { ...init, headers });
}

export async function GET(req: NextRequest) {
  const auth = await verifyQuickAuthFromRequest(req);
  if (!auth.ok) {
    return noStoreJson({ error: auth.error }, { status: auth.status });
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
    const runEligible = isRunWithin24Hours(lastPlayedAt);

    const walletAddressParam = req.nextUrl.searchParams.get("address")?.trim();
    const walletAddress = isAddressLike(walletAddressParam) ? walletAddressParam : null;

    let reason: ClaimReason = "eligible";
    let eligible = true;
    let nextClaimAt: number | null = null;
    let rewardUsd: number | null = null;
    let estimatedGasUsd: number | null = null;

    if (!runEligible) {
      eligible = false;
      reason = "play_required";
    }

    if (!walletAddress) {
      if (reason === "eligible") {
        reason = "wallet_required";
      }
      eligible = false;
    }

    if (walletAddress && runEligible) {
      try {
        nextClaimAt = await getNextClaimAt(walletAddress);
        const nowSec = Math.floor(Date.now() / 1000);
        if (nextClaimAt > nowSec) {
          reason = "cooldown";
          eligible = false;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("is not configured")) {
          throw error;
        }
        if (reason === "eligible") {
          reason = "wallet_required";
        }
        eligible = false;
      }
    }

    if (walletAddress && runEligible && reason !== "cooldown") {
      try {
        const signedClaim = await buildSignedClaim(walletAddress);
        const gasEstimate = await estimateClaimGas(walletAddress, signedClaim.calldata);
        const gasPriceWei = await getCurrentGasPriceWei();
        const economics = await calculateClaimEconomics({ gasEstimate, gasPriceWei });
        rewardUsd = economics.rewardUsd;
        estimatedGasUsd = economics.estimatedGasUsd;

        if (estimatedGasUsd >= rewardUsd) {
          reason = "gas_too_high";
          eligible = false;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("is not configured")) {
          throw error;
        }
        reason = "price_unavailable";
        eligible = false;
      }
    }

    return noStoreJson({
      fid: auth.fid,
      eligible,
      reason,
      rewardLabel: getRewardLabel(),
      rewardAmountRaw: getRewardAmountRaw().toString(),
      lastPlayedAt,
      runEligible,
      nextClaimAt,
      rewardUsd,
      estimatedGasUsd,
    });
  } catch (error: unknown) {
    const isRateLimit = isRpcRateLimitError(error);
    const message = getRpcFriendlyErrorMessage(error, "Claim status unavailable");
    return noStoreJson({ error: message }, { status: isRateLimit ? 503 : 500 });
  }
}
