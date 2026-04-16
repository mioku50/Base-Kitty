"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  buildWalletSignInMessage,
  normalizeHexAddress,
  type HexAddress,
} from "../lib/shared/walletAuth";

interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  walletAddress?: string;
  authType?: "wallet" | "farcaster";
}

type EthereumProvider = {
  request: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
};

interface FarcasterCtx {
  user: FarcasterUser | null;
  isSDKLoaded: boolean;
  isAuthenticated: boolean;
  authToken: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  composeCast: (text: string, options?: { embeds?: string[] }) => Promise<void>;
  getEthereumProvider: () => Promise<EthereumProvider | null>;
}

const AUTH_TOKEN_STORAGE_KEY = "nimbus_ascent:auth_token:v2";
const AUTH_USER_STORAGE_KEY = "nimbus_ascent:auth_user:v2";

type MiniAppSdkLike = {
  actions?: {
    ready?: () => Promise<unknown> | unknown;
    composeCast?: (input: { text: string; embeds?: string[] }) => Promise<unknown>;
  };
  wallet?: {
    ethProvider?: EthereumProvider;
    getEthereumProvider?: () => Promise<EthereumProvider | undefined>;
  };
};

const FarcasterContext = createContext<FarcasterCtx>({
  user: null,
  isSDKLoaded: false,
  isAuthenticated: false,
  authToken: null,
  signIn: async () => {},
  signOut: () => {},
  composeCast: async () => {},
  getEthereumProvider: async () => null,
});

export const useFarcaster = () => useContext(FarcasterContext);

function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const candidate = (
    window as unknown as {
      ethereum?: {
        request?: (params: { method: string; params?: unknown[] }) => Promise<unknown>;
      };
    }
  ).ethereum;
  if (!candidate || typeof candidate.request !== "function") return null;
  return candidate as EthereumProvider;
}

function randomNonceHex(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  window.crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function utf8ToHex(message: string): `0x${string}` {
  const encoded = new TextEncoder().encode(message);
  return `0x${Array.from(encoded)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export default function FarcasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [miniAppSdk, setMiniAppSdk] = useState<MiniAppSdkLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;

    (async () => {
      try {
        const sdkModule = await import("@farcaster/miniapp-sdk");
        if (!active) return;
        const sdk = (sdkModule.default || sdkModule) as MiniAppSdkLike;
        setMiniAppSdk(sdk);
        if (sdk.actions?.ready) {
          await sdk.actions.ready();
        }
      } catch {
        // Not running inside Farcaster mini app host (or SDK unavailable) — ignore.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cachedToken = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    const cachedUserRaw = window.localStorage.getItem(AUTH_USER_STORAGE_KEY);
    let cachedUser: FarcasterUser | null = null;
    if (cachedUserRaw) {
      try {
        cachedUser = JSON.parse(cachedUserRaw) as FarcasterUser;
      } catch {
        cachedUser = null;
      }
    }

    if (cachedToken && cachedUser) {
      setAuthToken(cachedToken);
      setUser(cachedUser);
      setIsAuthenticated(true);

      // Refresh/validate session token in background.
      fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cachedToken}`,
        },
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Session expired");
          }
          const data = (await res.json()) as {
            token?: string;
            user?: FarcasterUser;
          };
          const nextToken = data.token || cachedToken;
          const nextUser = data.user || cachedUser;
          setAuthToken(nextToken);
          setUser(nextUser);
          setIsAuthenticated(true);
          window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, nextToken);
          window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
        })
        .catch(() => {
          setAuthToken(null);
          setUser(null);
          setIsAuthenticated(false);
          window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
          window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
        })
        .finally(() => {
          setIsSDKLoaded(true);
        });
      return;
    }

    setIsSDKLoaded(true);
  }, []);

  const getEthereumProvider = useCallback(async () => {
    if (miniAppSdk?.wallet?.getEthereumProvider) {
      try {
        const provider = await miniAppSdk.wallet.getEthereumProvider();
        if (provider && typeof provider.request === "function") {
          return provider;
        }
      } catch {
        // Fall back to injected provider.
      }
    }

    if (miniAppSdk?.wallet?.ethProvider && typeof miniAppSdk.wallet.ethProvider.request === "function") {
      return miniAppSdk.wallet.ethProvider;
    }

    return getInjectedProvider();
  }, [miniAppSdk]);

  const signOut = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setIsAuthenticated(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  }, []);

  const signIn = useCallback(async () => {
    const provider = await getEthereumProvider();
    if (!provider) {
      throw new Error("Wallet provider is unavailable");
    }

    const accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[] | undefined;
    const address = normalizeHexAddress(accounts?.[0]);
    if (!address) {
      throw new Error("No wallet account is connected");
    }

    const nonce = randomNonceHex();
    const issuedAt = new Date().toISOString();
    const message = buildWalletSignInMessage({
      domain: window.location.hostname.toLowerCase(),
      address,
      nonce,
      issuedAt,
    });

    const messageHex = utf8ToHex(message);
    const attempts: unknown[][] = [
      [message, address],
      [address, message],
      [messageHex, address],
      [address, messageHex],
    ];

    let signature = "";
    let lastError: unknown = null;
    for (const params of attempts) {
      try {
        signature = (await provider.request({
          method: "personal_sign",
          params,
        })) as string;
        if (typeof signature === "string" && signature.startsWith("0x")) {
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!signature || typeof signature !== "string") {
      if (lastError instanceof Error) {
        throw lastError;
      }
      throw new Error("Wallet signature was not returned");
    }

    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address,
        message,
        signature,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Wallet sign-in failed");
    }

    const data = (await res.json()) as { token: string; user: FarcasterUser };
    if (!data.token || !data.user) {
      throw new Error("Invalid auth response");
    }

    setAuthToken(data.token);
    setUser(data.user);
    setIsAuthenticated(true);
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(data.user));
  }, [getEthereumProvider]);

  const composeCast = useCallback(
    async (text: string, options?: { embeds?: string[] }) => {
      const embeds = (options?.embeds ?? []).filter(Boolean).slice(0, 2);
      const primaryUrl = embeds[0] || (typeof window !== "undefined" ? window.location.origin : "");

      if (miniAppSdk?.actions?.composeCast) {
        try {
          await miniAppSdk.actions.composeCast({ text, embeds });
          return;
        } catch {
          // Fall back to native share / web compose.
        }
      }

      const canNativeShare =
        typeof navigator !== "undefined" && typeof navigator.share === "function";
      if (canNativeShare) {
        try {
          await navigator.share({
            text,
            url: primaryUrl || undefined,
          });
          return;
        } catch (error: unknown) {
          const errorName =
            typeof error === "object" && error && "name" in error
              ? String((error as { name?: string }).name)
              : "";
          if (errorName === "AbortError") {
            throw error;
          }
          // Fall through to web intent fallback.
        }
      }

      const params = new URLSearchParams({ text });
      embeds.forEach((embed) => params.append("embeds[]", embed));
      const composeUrl = `https://warpcast.com/~/compose?${params.toString()}`;
      window.open(composeUrl, "_blank", "noopener,noreferrer");
    },
    [miniAppSdk]
  );

  return (
    <FarcasterContext.Provider
      value={{
        user,
        isSDKLoaded,
        isAuthenticated,
        authToken,
        signIn,
        signOut,
        composeCast,
        getEthereumProvider,
      }}
    >
      {children}
    </FarcasterContext.Provider>
  );
}
