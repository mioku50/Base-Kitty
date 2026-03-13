import { NextRequest, NextResponse } from "next/server";
import {
  buildDailyTaskNonce,
  buildSignedClaim,
  claimCooldownSeconds,
  getBaseChainId,
  getClaimTxTarget,
  getNextClaimAt,
  getTaskRewardAmountRaw,
  getTaskRewardLabel,
  isAddressLike,
  isClaimNonceUsed,
  isRunWithin24Hours,
  nextUtcDayStartEpochSeconds,
  type BlessingTask,
} from "../../../../lib/server/claim";
import { verifyQuickAuthFromRequest } from "../../../../lib/server/farcasterAuth";
import {
  ensureRewardTables,
  ensureScoresTable,
  getSqlClient,
} from "../../../../lib/server/storage";

export const runtime = "nodejs";

type PrepareReason =
  | "play_required"
  | "cooldown"
  | "wallet_required"
  | "invite_required"
  | "task_invalid";

function noStoreJson(payload: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(payload, { ...init, headers });
}

function taskError(
  reason: PrepareReason,
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

function asTask(value: unknown): BlessingTask | null {
  if (value === "share" || value === "invite") return value;
  return null;
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

  const taskRaw = body && typeof body === "object" ? (body as Record<string, unknown>).task : null;
  const task = asTask(taskRaw);
  if (!task) {
    return taskError("task_invalid", "Task must be 'share' or 'invite'", 400);
  }

  const walletRaw =
    body && typeof body === "object" ? (body as Record<string, unknown>).address : undefined;
  const walletAddress = typeof walletRaw === "string" && isAddressLike(walletRaw)
    ? walletRaw
    : null;

  if (!walletAddress) {
    return taskError("wallet_required", "Wallet address is required", 400);
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

    const referralRows = (await sql`
      SELECT referred_fid
      FROM referrals
      WHERE referrer_fid = ${auth.fid}
      ORDER BY created_at DESC
      LIMIT 64
    `) as Array<{ referred_fid: number | string }>;

    const lastPlayedAt = Number(scoreRows[0]?.last_played_at ?? 0) || null;
    const referredCount = referralRows
      .map((row) => Number(row.referred_fid))
      .filter((fid) => Number.isInteger(fid) && fid > 0).length;

    let nonceOverride: bigint | undefined;

    if (task === "share") {
      if (!isRunWithin24Hours(lastPlayedAt)) {
        return taskError("play_required", "Play a run first", 409, {
          rewardLabel: getTaskRewardLabel("share"),
          lastPlayedAt,
        });
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const nextClaimAt = await getNextClaimAt(walletAddress, "share");
      if (nextClaimAt > nowSec) {
        return taskError("cooldown", "Share reward is on cooldown", 409, {
          nextClaimAt,
          cooldownSeconds: claimCooldownSeconds(),
        });
      }
    }

    if (task === "invite") {
      if (referredCount <= 0) {
        return taskError("invite_required", "Invite a friend who plays at least one run", 409);
      }

      const inviteNonce = buildDailyTaskNonce("invite", auth.fid);
      const usedToday = await isClaimNonceUsed(inviteNonce);
      if (usedToday) {
        return taskError("cooldown", "Invite reward already claimed today", 409, {
          nextClaimAt: nextUtcDayStartEpochSeconds(),
          cooldownSeconds: claimCooldownSeconds(),
        });
      }

      nonceOverride = inviteNonce;
    }

    const signedClaim = await buildSignedClaim(walletAddress, task, nonceOverride);

    return noStoreJson({
      fid: auth.fid,
      task,
      rewardLabel: getTaskRewardLabel(task),
      rewardAmountRaw: getTaskRewardAmountRaw(task).toString(),
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Task preparation failed";
    const status = message.includes("is not configured") ? 500 : 400;
    return noStoreJson({ error: message }, { status });
  }
}
