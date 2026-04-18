"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useFarcaster } from "./FarcasterProvider";
import KittyIcon from "./KittyIcon";
import { flushPendingScores } from "../lib/shared/scoreSubmission";

interface Props {
  onPlay: () => void;
  onLeaderboard: () => void;
}

type HexAddress = `0x${string}`;
type ClaimReason =
  | "eligible"
  | "play_required"
  | "wallet_required"
  | "cooldown"
  | "gas_too_high"
  | "price_unavailable";

type ClaimStatusResponse = {
  eligible: boolean;
  reason: ClaimReason;
  nextClaimAt: number | null;
  rewardLabel?: string;
  rewardUsd: number | null;
  estimatedGasUsd: number | null;
};

type TaskReason =
  | "eligible"
  | "play_required"
  | "wallet_required"
  | "cooldown"
  | "gas_too_high"
  | "price_unavailable"
  | "invite_required"
  | "items_required";

type TaskStatus = {
  eligible: boolean;
  reason: TaskReason;
  nextClaimAt: number | null;
  rewardUsd: number | null;
  estimatedGasUsd: number | null;
};

type TasksStatusResponse = {
  referredCount: number;
  lastRunItemsCollected: number;
  share: TaskStatus;
  streak: TaskStatus;
  invite: TaskStatus;
};

type ClaimPrepareResponse = {
  tx: {
    chainIdHex: string;
    to: HexAddress;
    data: `0x${string}`;
    value: `0x${string}`;
  };
};

type TaskPrepareResponse = ClaimPrepareResponse;

const BASE_CHAIN_ID = "0x2105";
const CLAIM_STATUS_POLL_INTERVAL_MS = 900;
const CLAIM_STATUS_POLL_ATTEMPTS = 10;
const CAST_COMPOSER_TIMEOUT_MS = 12000;
const WALLET_REQUEST_TIMEOUT_MS = 30000;
const PREPARE_REQUEST_TIMEOUT_MS = 20000;
const STATUS_REQUEST_TIMEOUT_MS = 12000;

type WalletProvider = {
  request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function asHexAddress(value: string | undefined): HexAddress | null {
  if (!value) return null;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as HexAddress) : null;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string };
  return e.name === "AbortError";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

function normalizeProviderError(err: unknown): string {
  let message = "";
  if (err instanceof Error && err.message) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  } else if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") {
      message = e.message;
    } else {
      const cause = e.cause as Record<string, unknown> | undefined;
      if (cause && typeof cause.message === "string") {
        message = cause.message;
      }
    }
  }

  if (message) {
    const lower = message.toLowerCase();
    if (
      lower.includes("status: 429") ||
      lower.includes("over rate limit") ||
      lower.includes("rate limit")
    ) {
      return "Base RPC is busy right now. Please retry in a few seconds.";
    }
    if (lower.includes("raw call arguments") || lower.includes("contract call: address")) {
      return "Blockchain RPC request failed. Please retry in a few seconds.";
    }
    return message;
  }

  return "Failed to claim daily blessing";
}

function isMethodUnsupportedError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message || "")
      : "";
  const lower = message.toLowerCase();
  return (
    lower.includes("method not found") ||
    lower.includes("unsupported method") ||
    lower.includes("does not exist") ||
    lower.includes("not implemented")
  );
}

function isTimeoutError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message || "")
      : "";
  return message.toLowerCase().includes("timed out");
}

async function providerRequest<T>(
  provider: WalletProvider,
  params: { method: string; params?: unknown[] },
  timeoutMessage = "Wallet request timed out. Please try again."
): Promise<T> {
  return withTimeout(
    provider.request(params) as Promise<T>,
    WALLET_REQUEST_TIMEOUT_MS,
    timeoutMessage
  );
}

async function resolveWalletAddress(
  provider: WalletProvider,
  hintedAddress?: string
): Promise<HexAddress | null> {
  const hinted = asHexAddress(hintedAddress);
  if (hinted) return hinted;

  try {
    const accounts = await withTimeout(
      provider.request({ method: "eth_accounts" }) as Promise<string[] | undefined>,
      6000,
      "Wallet account check timed out"
    );
    const fromAccounts = asHexAddress(accounts?.[0]);
    if (fromAccounts) return fromAccounts;
  } catch {
    // Continue to interactive request.
  }

  const requested = await providerRequest<string[] | undefined>(
    provider,
    {
      method: "eth_requestAccounts",
    },
    "Wallet connection request timed out. Please try again."
  );
  return asHexAddress(requested?.[0]);
}

function parseCallsId(result: unknown): string | null {
  if (typeof result === "string" && result.length > 0) return result;
  if (!result || typeof result !== "object") return null;
  const root = result as Record<string, unknown>;
  const id = root.id ?? root.callsId ?? root.callId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function extractTxHashFromCallsStatus(status: unknown): string | null {
  if (!status || typeof status !== "object") return null;
  const root = status as Record<string, unknown>;
  const receipts = Array.isArray(root.receipts) ? (root.receipts as unknown[]) : [];

  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== "object") continue;
    const r = receipt as Record<string, unknown>;
    const hash = r.transactionHash ?? r.txHash ?? r.hash;
    if (typeof hash === "string" && hash.startsWith("0x")) return hash;
  }

  const rootHash = root.transactionHash ?? root.txHash ?? root.hash;
  return typeof rootHash === "string" && rootHash.startsWith("0x") ? rootHash : null;
}

function formatCooldown(nextClaimAt: number | null) {
  if (!nextClaimAt) return "Come back later";

  const nowSec = Math.floor(Date.now() / 1000);
  const diffSec = Math.max(0, nextClaimAt - nowSec);
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);

  if (hours > 0) return `Come back in ${hours}h ${mins}m`;
  if (mins > 0) return `Come back in ${mins}m`;
  return "Come back in <1m";
}

function statusLabel(reason: ClaimReason, nextClaimAt: number | null) {
  switch (reason) {
    case "eligible":
      return "Claim now";
    case "play_required":
      return "Play a run first";
    case "wallet_required":
      return "Connect wallet";
    case "cooldown":
      return formatCooldown(nextClaimAt);
    case "gas_too_high":
      return "Gas too high";
    case "price_unavailable":
      return "Pricing unavailable";
    default:
      return "Claim unavailable";
  }
}

function taskStatusLabel(reason: TaskReason, nextClaimAt: number | null) {
  switch (reason) {
    case "eligible":
      return "Claim now";
    case "play_required":
      return "Play a run first";
    case "wallet_required":
      return "Connect wallet";
    case "cooldown":
      return formatCooldown(nextClaimAt);
    case "gas_too_high":
      return "Gas too high";
    case "price_unavailable":
      return "Pricing unavailable";
    case "invite_required":
      return "Invite a friend first";
    case "items_required":
      return "Collect 5 items in one run";
    default:
      return "Unavailable";
  }
}

export default function EntryScreen({ onPlay, onLeaderboard }: Props) {
  const { user, isSDKLoaded, signIn, composeCast, authToken, getEthereumProvider } =
    useFarcaster();

  const [claimPending, setClaimPending] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimTxHash, setClaimTxHash] = useState("");
  const [claimCallsId, setClaimCallsId] = useState("");
  const [lastClaimTask, setLastClaimTask] = useState<"daily" | "share" | "streak" | "invite" | null>(null);
  const [claimStatus, setClaimStatus] = useState<ClaimStatusResponse | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const [shareTaskCastPending, setShareTaskCastPending] = useState(false);
  const [inviteTaskCastPending, setInviteTaskCastPending] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const [showBlessings, setShowBlessings] = useState(false);
  const [tasksStatus, setTasksStatus] = useState<TasksStatusResponse | null>(null);
  const [taskClaimPending, setTaskClaimPending] = useState<"share" | "streak" | "invite" | null>(null);
  const [shareTaskPrimed, setShareTaskPrimed] = useState(false);
  const [inviteTaskPrimed, setInviteTaskPrimed] = useState(false);

  const dailyRewardLabel = claimStatus?.rewardLabel ?? "5 $Degen";
  const dailyRewardAmountDisplay = useMemo(() => {
    const match = dailyRewardLabel.match(/^\s*([0-9]+(?:\.[0-9]+)?)/);
    return match?.[1] || "5";
  }, [dailyRewardLabel]);

  const openCastComposer = useCallback(
    async (text: string, embeds: string[]) => {
      let timeoutId: number | null = null;
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        timeoutId = window.setTimeout(() => resolve("timeout"), CAST_COMPOSER_TIMEOUT_MS);
      });

      const castPromise = composeCast(text, { embeds }).then(() => "opened" as const);
      const result = await Promise.race([castPromise, timeoutPromise]);

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      return result;
    },
    [composeCast]
  );

  const claimButtonText = useMemo(() => {
    if (claimPending) {
      return "☁️ Claiming Daily Blessing...";
    }
    if (claimStatus) {
      if (claimStatus.eligible) {
        return `☁️ Claim Daily Blessing ${dailyRewardLabel} 😇`;
      }
      return `☁️ ${statusLabel(claimStatus.reason, claimStatus.nextClaimAt)}`;
    }
    return `☁️ Claim Daily Blessing ${dailyRewardLabel} 😇`;
  }, [claimPending, claimStatus, dailyRewardLabel]);

  const claimDisabled =
    !isSDKLoaded ||
    !user ||
    claimPending ||
    (claimStatus !== null && !claimStatus.eligible && claimStatus.reason !== "wallet_required");

  const fetchClaimStatus = useCallback(async () => {
    if (!isSDKLoaded || !user || !authToken) return;

    setClaimError("");

    try {
      const provider = await withTimeout(
        getEthereumProvider(),
        WALLET_REQUEST_TIMEOUT_MS,
        "Wallet provider is not responding. Please retry."
      );

      let addressQuery = "";
      if (provider) {
        const address = await resolveWalletAddress(provider, user.walletAddress);
        if (address) {
          addressQuery = `?address=${address}`;
        }
      }

      const response = await fetchWithTimeout(
        `/api/claim/status${addressQuery}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          cache: "no-store",
        },
        STATUS_REQUEST_TIMEOUT_MS,
        "Claim status request timed out. Please retry."
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorData.error || "Failed to fetch claim status");
      }

      const data = (await response.json()) as ClaimStatusResponse;
      setClaimStatus(data);

    } catch (err) {
      setClaimStatus(null);
      setClaimError(normalizeProviderError(err));
    }
  }, [authToken, getEthereumProvider, isSDKLoaded, user, user?.walletAddress]);

  useEffect(() => {
    fetchClaimStatus().catch(() => {
      // handled inside fetchClaimStatus
    });
  }, [fetchClaimStatus]);

  useEffect(() => {
    if (!isSDKLoaded || !user) return;
    flushPendingScores(authToken).catch(() => {
      // Best-effort sync for scores queued when app was closed quickly.
    });
  }, [authToken, isSDKLoaded, user]);

  const fetchTasksStatus = useCallback(async () => {
    if (!isSDKLoaded || !user || !authToken) return;

    try {
      const provider = await withTimeout(
        getEthereumProvider(),
        WALLET_REQUEST_TIMEOUT_MS,
        "Wallet provider is not responding. Please retry."
      );

      let addressQuery = "";
      if (provider) {
        const address = await resolveWalletAddress(provider, user.walletAddress);
        if (address) {
          addressQuery = `?address=${address}`;
        }
      }

      const response = await fetchWithTimeout(
        `/api/tasks/status${addressQuery}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          cache: "no-store",
        },
        STATUS_REQUEST_TIMEOUT_MS,
        "Task status request timed out. Please retry."
      );

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || "Failed to fetch task status");
      }

      const data = (await response.json()) as TasksStatusResponse;
      setTasksStatus(data);
    } catch (err) {
      setTasksStatus(null);
      setTaskMessage(normalizeProviderError(err));
    }
  }, [authToken, getEthereumProvider, isSDKLoaded, user, user?.walletAddress]);

  useEffect(() => {
    if (!showBlessings) return;
    fetchTasksStatus().catch(() => {
      // handled inside fetchTasksStatus
    });
  }, [fetchTasksStatus, showBlessings]);

  const sendClaimTransaction = useCallback(
    async (
      provider: WalletProvider,
      from: HexAddress,
      prepared: ClaimPrepareResponse
    ) => {
      const targetChain = (prepared.tx.chainIdHex || BASE_CHAIN_ID) as `0x${string}`;
      const chainId = await providerRequest<string>(provider, {
        method: "eth_chainId",
      });
      if (chainId !== targetChain) {
        try {
          await providerRequest(provider, {
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChain }],
          });
        } catch {
          // Continue and let wallet fallback behavior decide.
        }
      }

      let txHash = "";
      let callsId = "";
      const txPayload = {
        from,
        to: prepared.tx.to,
        value: prepared.tx.value,
        data: prepared.tx.data,
      };

      try {
        const sendCallsResult = await providerRequest<unknown>(
          provider,
          {
            method: "wallet_sendCalls",
            params: [
              {
                version: "1.0",
                chainId: targetChain,
                from,
                atomicRequired: false,
                calls: [
                  {
                    to: prepared.tx.to,
                    value: prepared.tx.value,
                    data: prepared.tx.data,
                  },
                ],
              },
            ],
          },
          "Transaction request timed out. Please retry claim."
        );
        const maybeCallsId = parseCallsId(sendCallsResult);
        if (!maybeCallsId) {
          throw new Error("wallet_sendCalls returned an empty id");
        }

        callsId = maybeCallsId;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const status = await withTimeout(
              provider.request({
                method: "wallet_getCallsStatus",
                params: [callsId],
              }) as Promise<unknown>,
              1800,
              "Status check timed out"
            );
            const resolvedTxHash = extractTxHashFromCallsStatus(status);
            if (resolvedTxHash) {
              txHash = resolvedTxHash;
              break;
            }
            if (status && typeof status === "object") {
              const s = status as Record<string, unknown>;
              const statusText = String(s.status ?? s.state ?? "").toLowerCase();
              if (
                statusText.includes("fail") ||
                statusText.includes("revert") ||
                statusText.includes("reject")
              ) {
                throw new Error("Claim transaction was rejected");
              }
            }
          } catch {
            // Some wallets don't support getCallsStatus reliably; keep the call id as success.
          }
          await delay(350);
        }
        return { txHash, callsId };
      } catch (sendCallsError) {
        if (!isMethodUnsupportedError(sendCallsError) && !isTimeoutError(sendCallsError)) {
          throw sendCallsError;
        }
      }

      txHash = await providerRequest<string>(
        provider,
        {
          method: "eth_sendTransaction",
          params: [
            {
              ...txPayload,
              chainId: targetChain,
            },
          ],
        },
        "Transaction confirmation timed out. Please retry claim."
      );
      if (!txHash || typeof txHash !== "string") {
        throw new Error("Transaction hash was not returned by wallet");
      }

      return { txHash, callsId };
    },
    []
  );

  const handleClaim = useCallback(async () => {
    setClaimPending(true);
    setClaimError("");
    setClaimTxHash("");
    setClaimCallsId("");
    setLastClaimTask("daily");

    try {
      const provider = await withTimeout(
        getEthereumProvider(),
        WALLET_REQUEST_TIMEOUT_MS,
        "Wallet provider is not responding. Please reopen the mini app and try again."
      );
      if (!provider) {
        throw new Error("Wallet provider is unavailable in this client");
      }

      const from = await resolveWalletAddress(provider, user?.walletAddress);
      if (!from) {
        throw new Error("No wallet account is connected");
      }

      if (!authToken) {
        throw new Error("Connect wallet first");
      }
      const prepareResponse = await fetchWithTimeout(
        "/api/claim/prepare",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ address: from }),
        },
        PREPARE_REQUEST_TIMEOUT_MS,
        "Claim preparation timed out. Please retry."
      );

      if (!prepareResponse.ok) {
        const errorData = (await prepareResponse.json().catch(() => ({}))) as {
          error?: string;
          reason?: ClaimReason;
          nextClaimAt?: number | null;
          rewardUsd?: number;
          estimatedGasUsd?: number;
        };

        if (errorData.reason) {
          setClaimStatus((prev) => ({
            eligible: false,
            reason: errorData.reason as ClaimReason,
            nextClaimAt: errorData.nextClaimAt ?? prev?.nextClaimAt ?? null,
            rewardUsd: errorData.rewardUsd ?? prev?.rewardUsd ?? null,
            estimatedGasUsd:
              errorData.estimatedGasUsd ?? prev?.estimatedGasUsd ?? null,
          }));
        }

        throw new Error(errorData.error || "Claim is unavailable");
      }

      const prepared = (await prepareResponse.json()) as ClaimPrepareResponse;
      const { txHash, callsId } = await sendClaimTransaction(provider, from, prepared);
      setClaimTxHash(txHash);
      setClaimCallsId(callsId);
      await Promise.all([fetchClaimStatus(), fetchTasksStatus()]);
    } catch (err) {
      setClaimError(normalizeProviderError(err));
    } finally {
      setClaimPending(false);
    }
  }, [authToken, fetchClaimStatus, fetchTasksStatus, getEthereumProvider, sendClaimTransaction, user?.walletAddress]);

  const handleTaskClaim = useCallback(
    async (task: "share" | "streak" | "invite") => {
      setTaskClaimPending(task);
      setTaskMessage("");
      setClaimError("");
      setLastClaimTask(task);

      try {
        const provider = await withTimeout(
          getEthereumProvider(),
          WALLET_REQUEST_TIMEOUT_MS,
          "Wallet provider is not responding. Please reopen the mini app and try again."
        );
        if (!provider) {
          throw new Error("Wallet provider is unavailable in this client");
        }

        const from = await resolveWalletAddress(provider, user?.walletAddress);
        if (!from) {
          throw new Error("No wallet account is connected");
        }

        if (!authToken) {
          throw new Error("Connect wallet first");
        }
        const response = await fetchWithTimeout(
          "/api/tasks/prepare",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ task, address: from }),
          },
          PREPARE_REQUEST_TIMEOUT_MS,
          "Task reward preparation timed out. Please retry."
        );

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorData.error || "Task claim is unavailable");
        }

        const prepared = (await response.json()) as TaskPrepareResponse;
        const { txHash, callsId } = await sendClaimTransaction(provider, from, prepared);
        setClaimTxHash(txHash);
        setClaimCallsId(callsId);
        if (task === "share") {
          setShareTaskPrimed(false);
        }
        if (task === "share") {
          setTaskMessage("Share reward claimed ✓");
        } else if (task === "streak") {
          setTaskMessage("Streak reward claimed ✓");
        } else {
          setTaskMessage("Invite reward claimed ✓");
        }
        await Promise.all([fetchClaimStatus(), fetchTasksStatus()]);
      } catch (err) {
        setTaskMessage(normalizeProviderError(err));
      } finally {
        setTaskClaimPending(null);
      }
    },
    [
      authToken,
      fetchClaimStatus,
      fetchTasksStatus,
      getEthereumProvider,
      sendClaimTransaction,
      user?.walletAddress,
    ]
  );

  const hasClaimSuccess = Boolean(claimTxHash || claimCallsId);
  const hasDailyClaimSuccess = hasClaimSuccess && lastClaimTask === "daily";

  const blessingOgUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams({
      kind: "blessing",
      username: user?.username || "angel",
      reward: dailyRewardAmountDisplay,
    });
    return `${window.location.origin}/api/og?${params.toString()}`;
  }, [dailyRewardAmountDisplay, user?.username]);

  const handleShareBlessingCard = useCallback(async () => {
    if (sharePending) return;
    setTaskMessage("");
    setSharePending(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const text = "💙 I claimed my Daily Blessing in Nimbus Ascent. Angel vibes only.";
      const embeds = [appUrl, blessingOgUrl].filter(Boolean);
      const result = await openCastComposer(text, embeds);
      setTaskMessage(
        result === "timeout"
          ? "Composer opened. Share the blessing card, then return to the game."
          : "Blessing card opened in composer ✓"
      );
    } catch (err) {
      setTaskMessage(normalizeProviderError(err));
    } finally {
      setSharePending(false);
    }
  }, [blessingOgUrl, openCastComposer, sharePending]);

  const handleShareBestScoreTask = useCallback(async () => {
    if (!user) {
      setTaskMessage("Connect wallet first");
      return;
    }
    if (shareTaskCastPending) return;
    setTaskMessage("");
    setShareTaskCastPending(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const bestRaw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(`nimbus_ascent:best:${user.fid}`) || "0"
          : "0";
      const bestScore = Math.max(0, Number(bestRaw) || 0);
      const scoreParams = new URLSearchParams({
        score: String(bestScore),
        username: user.username || `fid:${user.fid}`,
        stage: "2",
      });
      const scoreCardUrl = appUrl ? `${appUrl}/api/og?${scoreParams.toString()}` : "";
      const text = `😺 My best score in Nimbus Ascent is ${bestScore.toLocaleString()} pts.`;
      const result = await openCastComposer(text, [appUrl, scoreCardUrl].filter(Boolean));
      setShareTaskPrimed(true);
      setTaskMessage(
        result === "timeout"
          ? "Composer opened. Post the score card, then tap Claim +5 $Degen."
          : "Score card shared ✓ now tap Claim +5 $Degen"
      );
      await fetchTasksStatus();
    } catch (err) {
      setTaskMessage(normalizeProviderError(err));
    } finally {
      setShareTaskCastPending(false);
    }
  }, [fetchTasksStatus, openCastComposer, shareTaskCastPending, user]);

  const handleInviteFriendTask = useCallback(async () => {
    if (!user) {
      setTaskMessage("Connect wallet first");
      return;
    }
    if (inviteTaskCastPending) return;
    setTaskMessage("");
    setInviteTaskCastPending(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const inviteUrl = appUrl ? `${appUrl}/?ref=${user.fid}` : "";
      const text = "😇 Join Nimbus Ascent and claim Daily Blessings with me. +5 $Degen invite task.";
      const result = await openCastComposer(text, [inviteUrl || appUrl].filter(Boolean));
      setInviteTaskPrimed(true);
      setTaskMessage(
        result === "timeout"
          ? "Invite composer opened. After your friend plays, tap Claim +5 $Degen."
          : "Invite shared ✓ after friend plays, tap Claim +5 $Degen"
      );
      await fetchTasksStatus();
    } catch (err) {
      setTaskMessage(normalizeProviderError(err));
    } finally {
      setInviteTaskCastPending(false);
    }
  }, [fetchTasksStatus, inviteTaskCastPending, openCastComposer, user]);

  const shareTask = tasksStatus?.share;
  const streakTask = tasksStatus?.streak;
  const inviteTask = tasksStatus?.invite;
  const lastRunItemsCollected = tasksStatus?.lastRunItemsCollected ?? 0;
  const referredCount = tasksStatus?.referredCount ?? 0;

  const shareClaimButtonText = useMemo(() => {
    if (taskClaimPending === "share") return "Claiming +5...";
    return "Claim +5 $Degen";
  }, [taskClaimPending]);

  const inviteClaimButtonText = useMemo(() => {
    if (taskClaimPending === "invite") return "🎁 Claiming +5...";
    return "Claim +5 $Degen";
  }, [taskClaimPending]);

  const streakClaimButtonText = useMemo(() => {
    if (taskClaimPending === "streak") return "Claiming +2...";
    return "Claim +2 $Degen";
  }, [taskClaimPending]);

  const streakButtonLabel = useMemo(() => {
    if (!streakTask) return `🔥 ${streakClaimButtonText}`;
    if (streakTask.eligible) return `🔥 ${streakClaimButtonText}`;
    return `🔥 ${taskStatusLabel(streakTask.reason, streakTask.nextClaimAt)}`;
  }, [streakClaimButtonText, streakTask]);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-start z-50 overflow-y-auto overflow-x-hidden pt-4 pb-6 bg-gradient-to-b from-[#1a0533] via-[#0d1b2a] to-[#0a0020]"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
    >
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-purple-400/20 animate-pulse"
            style={{
              width: `${6 + (i % 3) * 4}px`,
              height: `${6 + (i % 3) * 4}px`,
              top: `${10 + (i * 12) % 90}%`,
              left: `${5 + (i * 13) % 90}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${2 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      <button
        onClick={() => setShowBlessings(true)}
        className="absolute top-3 right-3 z-20 px-3 py-2 rounded-xl border border-cyan-300/30 bg-cyan-500/15 text-cyan-100 text-xs font-black"
      >
        ✨ Tasks Blessings
      </button>

      {showBlessings && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm p-3">
          <div className="ml-auto w-full max-w-[320px] rounded-3xl border border-cyan-300/30 bg-gradient-to-b from-[#18073a] via-[#101a42] to-[#0a102e] p-4 shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-black text-sm">✨ Tasks Blessings</h2>
              <button
                onClick={() => setShowBlessings(false)}
                className="text-zinc-300 text-xs border border-white/20 rounded-lg px-2 py-1"
              >
                Close
              </button>
            </div>

            <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 mb-3 flex items-center gap-3">
              {user?.pfpUrl ? (
                <img
                  src={user.pfpUrl}
                  alt=""
                  className="w-10 h-10 rounded-full border-2 border-cyan-300/40"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <KittyIcon size={22} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white text-sm font-bold truncate">
                  {user?.displayName || user?.username || "Guest Angel"}
                </p>
                <p className="text-cyan-200/80 text-xs truncate">
                  @{user?.username || "sign-in-required"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleClaim}
                disabled={claimDisabled}
                className="w-full rounded-2xl border border-emerald-300/40 bg-emerald-400/15 px-3 py-3 text-white text-sm font-black disabled:opacity-50"
              >
                {`☁️ Claim Daily Blessing ${dailyRewardLabel} 😇`}
              </button>

              <button
                onClick={() => {
                  handleTaskClaim("streak").catch(() => {
                    // handled in callback
                  });
                }}
                disabled={!user || !streakTask?.eligible || taskClaimPending !== null}
                className="w-full rounded-2xl border border-purple-300/35 bg-purple-500/15 px-3 py-3 text-white text-sm font-bold disabled:opacity-50"
              >
                {streakButtonLabel}
              </button>

              <div className="rounded-xl border border-purple-300/20 bg-purple-500/10 px-3 py-2">
                <p className="text-purple-100 text-xs font-bold">What gives today</p>
                <p className="text-purple-200/90 text-[11px] mt-1">
                  Collect 5 items in one run to unlock streak reward +2 $Degen.
                </p>
                {tasksStatus && (
                  <p className="text-purple-200/80 text-[10px] mt-1">
                    Streak:{" "}
                    {streakTask
                      ? taskStatusLabel(streakTask.reason, streakTask.nextClaimAt)
                      : "Checking..."}{" "}
                    • Last run items: {lastRunItemsCollected}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-3">
                <p className="text-cyan-100 text-xs font-bold mb-2">💙 Share score card (+5 $Degen)</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleShareBestScoreTask}
                    disabled={!user || shareTaskCastPending || taskClaimPending !== null}
                    className="rounded-xl border border-cyan-300/30 bg-cyan-500/20 px-2 py-2 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {shareTaskCastPending ? "Sharing..." : "Share"}
                  </button>
                  <button
                    onClick={() => {
                      handleTaskClaim("share").catch(() => {
                        // handled in callback
                      });
                    }}
                    disabled={
                      !user ||
                      !shareTaskPrimed ||
                      !shareTask?.eligible ||
                      shareTaskCastPending ||
                      taskClaimPending !== null
                    }
                    className="rounded-xl border border-emerald-300/30 bg-emerald-500/20 px-2 py-2 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {shareClaimButtonText}
                  </button>
                </div>
                <p className="text-cyan-200/80 text-[10px] mt-2">
                  {shareTaskPrimed
                    ? "Shared in this session. You can claim when backend says eligible."
                    : "Step 1: Share, Step 2: Claim reward."}
                </p>
              </div>

              <div className="rounded-xl border border-blue-300/20 bg-blue-500/10 px-3 py-3">
                <p className="text-blue-100 text-xs font-bold mb-2">🫂 Invite a friend (+5 $Degen)</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      handleInviteFriendTask().catch(() => {
                        // handled in callback
                      });
                    }}
                    disabled={!user || inviteTaskCastPending || taskClaimPending !== null}
                    className="rounded-xl border border-blue-300/30 bg-blue-500/20 px-2 py-2 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {inviteTaskCastPending ? "Opening..." : "Invite"}
                  </button>
                  <button
                    onClick={() => {
                      handleTaskClaim("invite").catch(() => {
                        // handled in callback
                      });
                    }}
                    disabled={
                      !user ||
                      !inviteTask?.eligible ||
                      referredCount <= 0 ||
                      inviteTaskCastPending ||
                      taskClaimPending !== null
                    }
                    className="rounded-xl border border-emerald-300/30 bg-emerald-500/20 px-2 py-2 text-white text-xs font-bold disabled:opacity-50"
                  >
                    {inviteClaimButtonText}
                  </button>
                </div>
                <p className="text-blue-200/80 text-[10px] mt-2">
                  {inviteTaskPrimed
                    ? `Invite sent in this session. Referred players detected: ${referredCount}`
                    : `Step 1: Invite, Step 2: Friend plays. Referred players detected: ${referredCount}`}
                </p>
              </div>
            </div>

            {taskMessage && (
              <p className="mt-3 text-[11px] text-cyan-100/90 text-center">{taskMessage}</p>
            )}
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center px-6 pt-16 w-full max-w-xs">
        <div className="flex flex-col items-center mb-2">
          <span className="text-lg opacity-70">✨</span>
          <div className="relative w-[120px] h-[160px] mb-1">
            <Image
              src="/assets/kitty-hero.png"
              alt="Nimbus Ascent"
              fill
              style={{ objectFit: "contain" }}
              priority
            />
          </div>
          <span className="text-lg opacity-70">😇</span>
        </div>

        <h1 className="text-3xl font-black text-white text-center tracking-tight mb-1">
          Nimbus Ascent
        </h1>
        <p className="text-purple-300 text-sm font-medium mb-6 text-center">
          Rise from Web2 to Onchain Heaven!
        </p>

        {user ? (
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 mb-5 flex items-center gap-3">
            {user.pfpUrl ? (
              <img
                src={user.pfpUrl}
                alt=""
                className="w-10 h-10 rounded-full border-2 border-purple-500/50"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-purple-500/30 flex items-center justify-center">
                <KittyIcon size={22} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate">
                {user.displayName || user.username}
              </p>
              <p className="text-zinc-400 text-xs truncate">
                @{user.username || `fid:${user.fid}`}
              </p>
            </div>
            <div className="text-green-400 text-xs font-medium px-2 py-1 bg-green-400/10 rounded-full">
              ✓ Connected
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              signIn().catch((err) => {
                setClaimError(normalizeProviderError(err));
              });
            }}
            disabled={!isSDKLoaded}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 mb-5 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <KittyIcon size={18} />
            <span className="text-white font-semibold text-sm">Connect Wallet</span>
          </button>
        )}

        <button
          onClick={onPlay}
          className="w-full py-4 rounded-2xl font-black text-white text-lg mb-3 shadow-lg shadow-purple-500/25 active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
          }}
        >
          😺 PLAY
        </button>

        <button
          onClick={onLeaderboard}
          className="w-full py-3 rounded-2xl font-bold text-white text-sm border border-white/15 hover:bg-white/5 transition-colors mb-4"
        >
          😼 Leaderboard
        </button>

        {(claimTxHash || claimCallsId) && (
          <div className="w-full mb-3 rounded-xl border border-emerald-300/35 bg-emerald-500/10 px-3 py-2">
            {claimTxHash ? (
              <p className="text-emerald-200 text-xs text-center">
                ✅ Reward transaction sent:{" "}
                <a
                  href={`https://basescan.org/tx/${claimTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  open on BaseScan
                </a>
              </p>
            ) : (
              <p className="text-emerald-200 text-[11px] text-center break-all">
                ✅ Transaction submitted (call id): {claimCallsId}
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleClaim}
          disabled={claimDisabled}
          className="w-full py-3 rounded-2xl font-bold text-white text-sm border border-emerald-300/30 bg-emerald-400/10 hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
        >
          {claimButtonText}
        </button>

        <p className="mt-2 text-[11px] text-emerald-200/90 text-center">
          Play once per day and claim your angel reward
        </p>

        {hasDailyClaimSuccess && (
          <div className="w-full mt-3 rounded-2xl overflow-hidden border border-cyan-300/35 bg-gradient-to-br from-[#19063b] via-[#0f2048] to-[#07233e] shadow-lg shadow-cyan-900/25">
            <div className="relative px-4 py-4">
              <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-cyan-300/20 blur-2xl" />
              <div className="absolute -bottom-8 -left-6 w-20 h-20 rounded-full bg-purple-400/20 blur-2xl" />
              <div className="relative flex items-center justify-between gap-3">
                <div>
                  <p className="text-cyan-100 font-black text-sm leading-tight">
                    💙 Daily Blessing Claimed
                  </p>
                  <p className="text-cyan-200/90 text-[11px] mt-1">
                    Nimbus kitty holds your DEGEN heart.
                  </p>
                </div>
                <div className="relative w-16 h-16 shrink-0">
                  <Image
                    src="/assets/kitty-hero.png"
                    alt="Blessing kitty"
                    fill
                    style={{ objectFit: "contain" }}
                  />
                </div>
              </div>
              <div className="relative mt-3 flex justify-center">
                <div className="px-3 py-1 rounded-full bg-cyan-400/20 border border-cyan-200/40 text-cyan-100 text-xs font-black">
                  💙 DEGEN TOKEN
                </div>
              </div>
            </div>
            <button
              onClick={handleShareBlessingCard}
              disabled={sharePending}
              className="w-full py-2.5 text-sm font-black text-white bg-cyan-500/20 border-t border-cyan-300/30 disabled:opacity-50"
            >
              {sharePending ? "Sharing..." : "Share Blessing Card 💙"}
            </button>
          </div>
        )}

        {claimError && <p className="mt-2 text-red-300 text-xs text-center">{claimError}</p>}

        <p className="text-zinc-600 text-[10px] text-center mt-4">
          Built on Base • Standard Web Wallet
        </p>
      </div>
    </div>
  );
}
