"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { useFarcaster } from "./FarcasterProvider";
import KittyIcon from "./KittyIcon";
import { sdk } from "@farcaster/miniapp-sdk";

interface Props {
  onPlay: () => void;
  onLeaderboard: () => void;
}

type HexAddress = `0x${string}`;
const BASE_CHAIN_ID = "0x2105";
const GM_CALL_DATA = "0x";
const GM_STATUS_POLL_INTERVAL_MS = 900;
const GM_STATUS_POLL_ATTEMPTS = 10;

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
  return "Failed to send gm transaction";
}

function extractTxHashFromCallsStatus(status: unknown): string | null {
  if (!status || typeof status !== "object") return null;
  const root = status as Record<string, unknown>;
  const receipts = Array.isArray(root.receipts) ? (root.receipts as unknown[]) : [];

  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== "object") continue;
    const r = receipt as Record<string, unknown>;
    const hash =
      r.transactionHash ??
      r.txHash ??
      r.hash;
    if (typeof hash === "string" && hash.startsWith("0x")) return hash;
  }

  const rootHash = root.transactionHash ?? root.txHash ?? root.hash;
  return typeof rootHash === "string" && rootHash.startsWith("0x") ? rootHash : null;
}

export default function EntryScreen({ onPlay, onLeaderboard }: Props) {
  const { user, isSDKLoaded, signIn } = useFarcaster();
  const [gmStatus, setGmStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [gmError, setGmError] = useState<string>("");
  const [gmTxHash, setGmTxHash] = useState<string>("");
  const [gmCallsId, setGmCallsId] = useState<string>("");
  const isGmPending = gmStatus === "pending";
  const gmTargetAddress = useMemo(
    () => process.env.NEXT_PUBLIC_GM_TARGET_ADDRESS?.trim() || "",
    []
  );

  const handleGmTx = useCallback(async () => {
    setGmStatus("pending");
    setGmError("");
    setGmTxHash("");
    setGmCallsId("");

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

      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      if (chainId !== BASE_CHAIN_ID) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: BASE_CHAIN_ID }],
          });
        } catch {
          // Continue and let the wallet decide if tx can be sent on current chain.
        }
      }

      const to = asHexAddress(gmTargetAddress) || from;
      let txHash = "";
      let callsId = "";

      try {
        // Prefer EIP-5792 for Base smart wallets (Base App).
        const maybeCallsId = (await provider.request({
          method: "wallet_sendCalls",
          params: [
            {
              version: "1.0",
              chainId: BASE_CHAIN_ID,
              from,
              calls: [
                {
                  to,
                  value: "0x0",
                  data: GM_CALL_DATA,
                },
              ],
            },
          ],
        })) as string;

        if (typeof maybeCallsId !== "string" || maybeCallsId.length === 0) {
          throw new Error("wallet_sendCalls returned an empty id");
        }

        callsId = maybeCallsId;

        for (let attempt = 0; attempt < GM_STATUS_POLL_ATTEMPTS; attempt++) {
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
              throw new Error("gm transaction was rejected");
            }
          }

          await delay(GM_STATUS_POLL_INTERVAL_MS);
        }
      } catch {
        // Fallback for clients that do not support wallet_sendCalls.
        txHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to,
              value: "0x0",
              data: GM_CALL_DATA,
            },
          ],
        })) as string;
      }

      setGmTxHash(txHash);
      setGmCallsId(callsId);
      setGmStatus("success");
    } catch (err) {
      const message = normalizeProviderError(err);
      setGmError(message);
      setGmStatus("error");
    }
  }, [gmTargetAddress]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0533] via-[#0d1b2a] to-[#0a0020]" />

      {/* Floating particles */}
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

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-xs">
        {/* Logo / kitty */}
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

        {/* User profile card */}
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
            <span className="text-white font-semibold text-sm">
              Sign in with Farcaster
            </span>
          </button>
        )}

        {/* Play button */}
        <button
          onClick={onPlay}
          className="w-full py-4 rounded-2xl font-black text-white text-lg mb-3 shadow-lg shadow-purple-500/25 active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)",
          }}
        >
          😺 PLAY
        </button>

        {/* Leaderboard button */}
        <button
          onClick={onLeaderboard}
          className="w-full py-3 rounded-2xl font-bold text-white text-sm border border-white/15 hover:bg-white/5 transition-colors mb-4"
        >
          😼 Leaderboard
        </button>

        <button
          onClick={handleGmTx}
          disabled={!isSDKLoaded || isGmPending}
          className="w-full py-3 rounded-2xl font-bold text-white text-sm border border-emerald-300/30 bg-emerald-400/10 hover:bg-emerald-400/20 transition-colors disabled:opacity-50"
        >
          {isGmPending ? "😇 Sending gm tx..." : "😇 gm on Base"}
        </button>

        {gmStatus === "success" && (
          <>
            {gmTxHash ? (
              <a
                href={`https://basescan.org/tx/${gmTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 text-emerald-300 text-xs underline underline-offset-2"
              >
                gm tx sent ✓ view on BaseScan
              </a>
            ) : (
              <p className="mt-2 text-emerald-300 text-xs text-center">
                gm request sent ✓ check wallet activity
              </p>
            )}
            {!gmTxHash && gmCallsId && (
              <p className="mt-1 text-emerald-200/80 text-[10px] text-center break-all">
                call id: {gmCallsId}
              </p>
            )}
          </>
        )}

        {gmStatus === "error" && (
          <p className="mt-2 text-red-300 text-xs text-center">{gmError}</p>
        )}

        {/* Footer */}
        <p className="text-zinc-600 text-[10px] text-center mt-4">
          Built on Base • Powered by Farcaster
        </p>
      </div>
    </div>
  );
}
