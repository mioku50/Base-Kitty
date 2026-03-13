"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { sdk } from "@farcaster/miniapp-sdk";
import { useFarcaster } from "./FarcasterProvider";
import KittyIcon from "./KittyIcon";

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
  rewardUsd: number | null;
  estimatedGasUsd: number | null;
};

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

type TasksStatusResponse = {
  streakDays: number;
  availableInvites: number;
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
const PIN_PROMPT_STORAGE_KEY = "nimbus_ascent:pin_prompt_seen:v1";

function asHexAddress(value: string | undefined): HexAddress | null {
  if (!value) return null;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as HexAddress) : null;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeProviderError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    const cause = e.cause as Record<string, unknown> | undefined;
    if (cause && typeof cause.message === "string") return cause.message;
  }
  return "Failed to claim daily blessing";
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
    case "streak_required":
      return "Need 2-day streak";
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
    default:
      return "Unavailable";
  }
}

export default function EntryScreen({ onPlay, onLeaderboard }: Props) {
  const { user, isSDKLoaded, signIn, composeCast } = useFarcaster();

  const [claimPending, setClaimPending] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimTxHash, setClaimTxHash] = useState("");
  const [claimCallsId, setClaimCallsId] = useState("");
  const [claimStatus, setClaimStatus] = useState<ClaimStatusResponse | null>(null);
  const [sharePending, setSharePending] = useState(false);
  const [taskMessage, setTaskMessage] = useState("");
  const [showBlessings, setShowBlessings] = useState(false);
  const [tasksStatus, setTasksStatus] = useState<TasksStatusResponse | null>(null);
  const [taskClaimPending, setTaskClaimPending] = useState<"streak" | "invite" | null>(null);

  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [pinMessage, setPinMessage] = useState("");

  const claimButtonText = useMemo(() => {
    if (claimPending) {
      return "☁️ Claiming Daily Blessing...";
    }
    if (claimStatus) {
      if (claimStatus.eligible) {
        return "☁️ Claim Daily Blessing 10 $Degen 😇";
      }
      return `☁️ ${statusLabel(claimStatus.reason, claimStatus.nextClaimAt)}`;
    }
    return "☁️ Claim Daily Blessing 10 $Degen 😇";
  }, [claimPending, claimStatus]);

  const claimDisabled =
    !isSDKLoaded ||
    !user ||
    claimPending ||
    (claimStatus !== null && !claimStatus.eligible && claimStatus.reason !== "wallet_required");

  const fetchClaimStatus = useCallback(async () => {
    if (!isSDKLoaded || !user) return;

    setClaimError("");

    try {
      const { token } = await sdk.quickAuth.getToken();
      const provider = await sdk.wallet.getEthereumProvider();

      let addressQuery = "";
      if (provider) {
        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as string[] | undefined;
        const address = asHexAddress(accounts?.[0]);
        if (address) {
          addressQuery = `?address=${address}`;
        }
      }

      const response = await fetch(`/api/claim/status${addressQuery}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

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
  }, [isSDKLoaded, user]);

  useEffect(() => {
    fetchClaimStatus().catch(() => {
      // handled inside fetchClaimStatus
    });
  }, [fetchClaimStatus]);

  const fetchTasksStatus = useCallback(async () => {
    if (!isSDKLoaded || !user) return;

    try {
      const { token } = await sdk.quickAuth.getToken();
      const provider = await sdk.wallet.getEthereumProvider();

      let addressQuery = "";
      if (provider) {
        const accounts = (await provider.request({
          method: "eth_accounts",
        })) as string[] | undefined;
        const address = asHexAddress(accounts?.[0]);
        if (address) {
          addressQuery = `?address=${address}`;
        }
      }

      const response = await fetch(`/api/tasks/status${addressQuery}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

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
  }, [isSDKLoaded, user]);

  useEffect(() => {
    fetchTasksStatus().catch(() => {
      // handled inside fetchTasksStatus
    });
  }, [fetchTasksStatus]);

  const sendClaimTransaction = useCallback(
    async (
      provider: {
        request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
      },
      from: HexAddress,
      prepared: ClaimPrepareResponse
    ) => {
      const targetChain = (prepared.tx.chainIdHex || BASE_CHAIN_ID) as `0x${string}`;
      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      if (chainId !== targetChain) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChain }],
          });
        } catch {
          // Continue and let wallet fallback behavior decide.
        }
      }

      let txHash = "";
      let callsId = "";

      try {
        const maybeCallsId = (await provider.request({
          method: "wallet_sendCalls",
          params: [
            {
              version: "1.0",
              chainId: targetChain,
              from,
              calls: [
                {
                  to: prepared.tx.to,
                  value: prepared.tx.value,
                  data: prepared.tx.data,
                },
              ],
            },
          ],
        })) as string;

        if (typeof maybeCallsId !== "string" || maybeCallsId.length === 0) {
          throw new Error("wallet_sendCalls returned an empty id");
        }

        callsId = maybeCallsId;

        for (let attempt = 0; attempt < CLAIM_STATUS_POLL_ATTEMPTS; attempt++) {
          const status = await provider.request({
            method: "wallet_getCallsStatus",
            params: [callsId],
          });

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

          await delay(CLAIM_STATUS_POLL_INTERVAL_MS);
        }
      } catch {
        txHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to: prepared.tx.to,
              value: prepared.tx.value,
              data: prepared.tx.data,
            },
          ],
        })) as string;
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

    try {
      const provider = await sdk.wallet.getEthereumProvider();
      if (!provider) {
        throw new Error("Wallet provider is unavailable in this client");
      }

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[] | undefined;
      const from = asHexAddress(accounts?.[0]);
      if (!from) {
        throw new Error("No wallet account is connected");
      }

      const { token } = await sdk.quickAuth.getToken();
      const prepareResponse = await fetch("/api/claim/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ address: from }),
      });

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
  }, [fetchClaimStatus, fetchTasksStatus, sendClaimTransaction]);

  const handleTaskClaim = useCallback(
    async (task: "streak" | "invite") => {
      setTaskClaimPending(task);
      setTaskMessage("");
      setClaimError("");

      try {
        const provider = await sdk.wallet.getEthereumProvider();
        if (!provider) {
          throw new Error("Wallet provider is unavailable in this client");
        }

        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[] | undefined;
        const from = asHexAddress(accounts?.[0]);
        if (!from) {
          throw new Error("No wallet account is connected");
        }

        const { token } = await sdk.quickAuth.getToken();
        const response = await fetch("/api/tasks/prepare", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ task, address: from }),
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorData.error || "Task claim is unavailable");
        }

        const prepared = (await response.json()) as TaskPrepareResponse;
        const { txHash, callsId } = await sendClaimTransaction(provider, from, prepared);
        setClaimTxHash(txHash);
        setClaimCallsId(callsId);
        setTaskMessage(task === "streak" ? "Streak reward claimed ✓" : "Invite reward claimed ✓");
        await Promise.all([fetchClaimStatus(), fetchTasksStatus()]);
      } catch (err) {
        setTaskMessage(normalizeProviderError(err));
      } finally {
        setTaskClaimPending(null);
      }
    },
    [fetchClaimStatus, fetchTasksStatus, sendClaimTransaction]
  );

  useEffect(() => {
    if (!isSDKLoaded || typeof window === "undefined") return;
    const alreadySeen = window.localStorage.getItem(PIN_PROMPT_STORAGE_KEY) === "1";
    if (alreadySeen) return;

    let cancelled = false;

    const run = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        if (!inMiniApp || cancelled) return;

        const ctx = await sdk.context;
        if (cancelled) return;

        if (ctx?.client?.added === false) {
          setShowPinPrompt(true);
          return;
        }

        window.localStorage.setItem(PIN_PROMPT_STORAGE_KEY, "1");
      } catch {
        // Ignore outside Mini App hosts.
      }
    };

    run().catch(() => {
      // ignore
    });

    return () => {
      cancelled = true;
    };
  }, [isSDKLoaded]);

  const handleDismissPin = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PIN_PROMPT_STORAGE_KEY, "1");
    }
    setShowPinPrompt(false);
  }, []);

  const handleAddMiniApp = useCallback(async () => {
    setPinPending(true);
    setPinMessage("");

    try {
      await sdk.actions.addMiniApp();
      setPinMessage("Mini App pinned ✓");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PIN_PROMPT_STORAGE_KEY, "1");
      }
      window.setTimeout(() => {
        setShowPinPrompt(false);
      }, 800);
    } catch (err) {
      setPinMessage(normalizeProviderError(err));
    } finally {
      setPinPending(false);
    }
  }, []);

  const hasClaimSuccess = Boolean(claimTxHash || claimCallsId);

  const blessingOgUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams({
      kind: "blessing",
      username: user?.username || "angel",
      reward: "10",
    });
    return `${window.location.origin}/api/og?${params.toString()}`;
  }, [user?.username]);

  const handleShareBlessingCard = useCallback(async () => {
    if (sharePending) return;
    setTaskMessage("");
    setSharePending(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const text = "💙 I claimed my Daily Blessing in Nimbus Ascent. Angel vibes only.";
      const embeds = [appUrl, blessingOgUrl].filter(Boolean);
      await composeCast(text, { embeds });
      setTaskMessage("Blessing card opened in composer ✓");
    } catch (err) {
      setTaskMessage(normalizeProviderError(err));
    } finally {
      setSharePending(false);
    }
  }, [blessingOgUrl, composeCast, sharePending]);

  const handleShareBestScoreTask = useCallback(async () => {
    if (!user) {
      setTaskMessage("Sign in with Farcaster first");
      return;
    }
    if (sharePending) return;
    setTaskMessage("");
    setSharePending(true);
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
      await composeCast(text, { embeds: [appUrl, scoreCardUrl].filter(Boolean) });
      setTaskMessage("Score card opened in composer ✓ (+1 $Degen task)");
    } catch (err) {
      setTaskMessage(normalizeProviderError(err));
    } finally {
      setSharePending(false);
    }
  }, [composeCast, sharePending, user]);

  const handleInviteFriendTask = useCallback(async () => {
    if (!user) {
      setTaskMessage("Sign in with Farcaster first");
      return;
    }
    if (sharePending) return;
    setTaskMessage("");
    setSharePending(true);
    try {
      const appUrl = typeof window !== "undefined" ? window.location.origin : "";
      const inviteUrl = appUrl ? `${appUrl}/?ref=${user.fid}` : "";
      const text = "😇 Join Nimbus Ascent and claim Daily Blessings with me. +2 $Degen invite task.";
      await composeCast(text, { embeds: [inviteUrl || appUrl].filter(Boolean) });
      setTaskMessage("Invite opened in composer ✓");
    } catch (err) {
      setTaskMessage(normalizeProviderError(err));
    } finally {
      setSharePending(false);
    }
  }, [composeCast, sharePending, user]);

  const handleShowStreakTask = useCallback(() => {
    setTaskMessage("Streak bonuses: +1 $Degen reward, rare drops and UI skins.");
  }, []);

  const streakTask = tasksStatus?.streak;
  const inviteTask = tasksStatus?.invite;
  const availableInvites = tasksStatus?.availableInvites ?? 0;

  const streakButtonText = useMemo(() => {
    if (taskClaimPending === "streak") return "🔥 Claiming streak reward...";
    if (!streakTask) return "🔥 Streak Blessing (+1 $Degen)";
    if (streakTask.eligible) return "🔥 Claim Streak Bonus +1 $Degen";
    return `🔥 ${taskStatusLabel(streakTask.reason, streakTask.nextClaimAt)}`;
  }, [streakTask, taskClaimPending]);

  const inviteButtonText = useMemo(() => {
    if (taskClaimPending === "invite") return "🎁 Claiming invite reward...";
    if (inviteTask?.eligible && availableInvites > 0) {
      return `🎁 Claim Invite Reward +2 $Degen (${availableInvites})`;
    }
    return "🫂 Invite a friend (+2 $Degen)";
  }, [availableInvites, inviteTask?.eligible, taskClaimPending]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0533] via-[#0d1b2a] to-[#0a0020]" />

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

      {showPinPrompt && (
        <div className="absolute top-3 left-3 right-3 z-30 rounded-2xl border border-purple-300/40 bg-[#140728]/95 p-3 shadow-lg shadow-purple-900/30">
          <p className="text-white text-sm font-bold">Pin Nimbus Ascent</p>
          <p className="text-purple-200 text-xs mt-1">
            Add Mini App to your launcher for faster daily claims.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleAddMiniApp}
              disabled={pinPending}
              className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-purple-500/60 border border-purple-300/40 disabled:opacity-60"
            >
              {pinPending ? "Pinning..." : "📌 Pin Mini App"}
            </button>
            <button
              onClick={handleDismissPin}
              className="px-3 py-2 rounded-xl text-xs font-bold text-zinc-200 border border-white/15"
            >
              Later
            </button>
          </div>
          {pinMessage && <p className="text-[11px] text-purple-200 mt-2">{pinMessage}</p>}
        </div>
      )}

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
                ☁️ Claim Daily Blessing 10 $Degen 😇
              </button>

              <button
                onClick={() => {
                  if (streakTask?.eligible) {
                    handleTaskClaim("streak").catch(() => {
                      // handled in callback
                    });
                    return;
                  }
                  if (streakTask) {
                    setTaskMessage(taskStatusLabel(streakTask.reason, streakTask.nextClaimAt));
                    return;
                  }
                  handleShowStreakTask();
                }}
                disabled={taskClaimPending !== null || !user}
                className="w-full rounded-2xl border border-purple-300/35 bg-purple-500/15 px-3 py-3 text-white text-sm font-bold disabled:opacity-50"
              >
                {streakButtonText}
              </button>

              <div className="rounded-xl border border-purple-300/20 bg-purple-500/10 px-3 py-2">
                <p className="text-purple-100 text-xs font-bold">What gives today</p>
                <p className="text-purple-200/90 text-[11px] mt-1">
                  +1 token bonus, rare item drops, UI skin chance.
                </p>
                {tasksStatus && (
                  <p className="text-purple-200/80 text-[10px] mt-1">
                    Streak: {tasksStatus.streakDays} day(s) • Invite rewards ready: {availableInvites}
                  </p>
                )}
              </div>

              <button
                onClick={handleShareBestScoreTask}
                disabled={!user || sharePending}
                className="w-full rounded-2xl border border-cyan-300/35 bg-cyan-500/15 px-3 py-3 text-white text-sm font-bold disabled:opacity-50"
              >
                💙 +1 $Degen • Share score card
              </button>

              <button
                onClick={() => {
                  if (inviteTask?.eligible && availableInvites > 0) {
                    handleTaskClaim("invite").catch(() => {
                      // handled in callback
                    });
                    return;
                  }
                  handleInviteFriendTask().catch(() => {
                    // handled in callback
                  });
                }}
                disabled={!user || sharePending || taskClaimPending !== null}
                className="w-full rounded-2xl border border-blue-300/35 bg-blue-500/15 px-3 py-3 text-white text-sm font-bold disabled:opacity-50"
              >
                {inviteButtonText}
              </button>
            </div>

            {taskMessage && (
              <p className="mt-3 text-[11px] text-cyan-100/90 text-center">{taskMessage}</p>
            )}
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-xs">
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
            onClick={signIn}
            disabled={!isSDKLoaded}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 mb-5 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors disabled:opacity-40"
          >
            <KittyIcon size={18} />
            <span className="text-white font-semibold text-sm">Sign in with Farcaster</span>
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

        {hasClaimSuccess && (
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

        {claimTxHash && (
          <a
            href={`https://basescan.org/tx/${claimTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-emerald-300 text-xs underline underline-offset-2"
          >
            claim tx sent ✓ view on BaseScan
          </a>
        )}

        {!claimTxHash && claimCallsId && (
          <p className="mt-1 text-emerald-200/80 text-[10px] text-center break-all">
            call id: {claimCallsId}
          </p>
        )}

        {claimError && <p className="mt-2 text-red-300 text-xs text-center">{claimError}</p>}

        <p className="text-zinc-600 text-[10px] text-center mt-4">
          Built on Base • Powered by Farcaster
        </p>
      </div>
    </div>
  );
}
