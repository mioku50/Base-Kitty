import { NextRequest, NextResponse } from "next/server";
import {
  buildSignedClaim,
  calculateClaimEconomics,
  estimateClaimGas,
  findFirstAvailableInviteNonce,
  getCurrentGasPriceWei,
  getNextClaimAt,
  isAddressLike,
  isRunWithin24Hours,
} from "../../../../lib/server/claim";
import { verifyQuickAuthFromRequest } from "../../../../lib/server/farcasterAuth";
import {
  ensureRewardTables,
  ensureScoresTable,
  getSqlClient,
} from "../../../../lib/server/storage";

export const runtime = "nodejs";

type TaskReason =
  | "eligible"
  | "play_required"
  | "streak_required"
  | "wallet_required"
  | "cooldown"
  | "gas_too_high"
  | "price_unavailable"
  | "invite_required";

type TaskStatus = {
  eligible: boolean;
  reason: TaskReason;
  nextClaimAt: number | null;
  rewardUsd: number | null;
  estimatedGasUsd: number | null;
};

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
    await ensureRewardTables(sql);

    const scoreRows = (await sql`
      SELECT last_played_at
      FROM scores
      WHERE fid = ${auth.fid}
      LIMIT 1
    `) as Array<{ last_played_at: number | string | null }>;

    const streakRows = (await sql`
      SELECT streak_days
      FROM player_streaks
      WHERE fid = ${auth.fid}
      LIMIT 1
    `) as Array<{ streak_days: number | string | null }>;

    const referralRows = (await sql`
      SELECT referred_fid
      FROM referrals
      WHERE referrer_fid = ${auth.fid}
      ORDER BY created_at DESC
      LIMIT 64
    `) as Array<{ referred_fid: number | string }>;

    const lastPlayedAt = Number(scoreRows[0]?.last_played_at ?? 0) || null;
    const runEligible = isRunWithin24Hours(lastPlayedAt);
    const streakDays = Number(streakRows[0]?.streak_days ?? 0) || 0;
    const referredFids = referralRows
      .map((row) => Number(row.referred_fid))
      .filter((fid) => Number.isInteger(fid) && fid > 0);

    const walletAddressParam = req.nextUrl.searchParams.get("address")?.trim();
    const walletAddress = isAddressLike(walletAddressParam) ? walletAddressParam : null;

    const streak: TaskStatus = {
      eligible: false,
      reason: "play_required",
      nextClaimAt: null,
      rewardUsd: null,
      estimatedGasUsd: null,
    };

    if (!runEligible) {
      streak.reason = "play_required";
    } else if (streakDays < 2) {
      streak.reason = "streak_required";
    } else if (!walletAddress) {
      streak.reason = "wallet_required";
    } else {
      const nowSec = Math.floor(Date.now() / 1000);
      const nextClaimAt = await getNextClaimAt(walletAddress, "streak");
      streak.nextClaimAt = nextClaimAt;

      if (nextClaimAt > nowSec) {
        streak.reason = "cooldown";
      } else {
        try {
          const signedClaim = await buildSignedClaim(walletAddress, "streak");
          const gasEstimate = await estimateClaimGas(walletAddress, signedClaim.calldata);
          const gasPriceWei = await getCurrentGasPriceWei();
          const economics = await calculateClaimEconomics({
            task: "streak",
            gasEstimate,
            gasPriceWei,
          });

          streak.rewardUsd = economics.rewardUsd;
          streak.estimatedGasUsd = economics.estimatedGasUsd;

          if (economics.estimatedGasUsd >= economics.rewardUsd) {
            streak.reason = "gas_too_high";
          } else {
            streak.eligible = true;
            streak.reason = "eligible";
          }
        } catch {
          streak.reason = "price_unavailable";
        }
      }
    }

    const invite: TaskStatus = {
      eligible: false,
      reason: "invite_required",
      nextClaimAt: null,
      rewardUsd: null,
      estimatedGasUsd: null,
    };

    let availableInvites = 0;
    if (referredFids.length === 0) {
      invite.reason = "invite_required";
    } else if (!walletAddress) {
      invite.reason = "wallet_required";
    } else {
      const available = await findFirstAvailableInviteNonce(auth.fid, referredFids);
      availableInvites = available.availableCount;

      if (!available.nonce || available.availableCount <= 0) {
        invite.reason = "invite_required";
      } else {
        try {
          const signedClaim = await buildSignedClaim(walletAddress, "invite", available.nonce);
          const gasEstimate = await estimateClaimGas(walletAddress, signedClaim.calldata);
          const gasPriceWei = await getCurrentGasPriceWei();
          const economics = await calculateClaimEconomics({
            task: "invite",
            gasEstimate,
            gasPriceWei,
          });

          invite.rewardUsd = economics.rewardUsd;
          invite.estimatedGasUsd = economics.estimatedGasUsd;

          if (economics.estimatedGasUsd >= economics.rewardUsd) {
            invite.reason = "gas_too_high";
          } else {
            invite.eligible = true;
            invite.reason = "eligible";
          }
        } catch {
          invite.reason = "price_unavailable";
        }
      }
    }

    return noStoreJson({
      fid: auth.fid,
      runEligible,
      lastPlayedAt,
      streakDays,
      streak,
      invite,
      availableInvites,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Task status unavailable";
    return noStoreJson({ error: message }, { status: 500 });
  }
}
