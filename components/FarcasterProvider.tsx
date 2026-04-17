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
  context?: Promise<{
    user?: {
      fid?: number;
      username?: string;
      displayName?: string;
      pfpUrl?: string;
    };
  }>;
  actions?: {
    ready?: () => Promise<unknown> | unknown;
    composeCast?: (input: { text: string; embeds?: string[] }) => Promise<unknown>;
  };
  quickAuth?: {
    getToken?: (options?: { force?: boolean; quickAuthServerOrigin?: string }) => Promise<{
      token?: string;
    }>;
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

function isFallbackWalletUser(user: FarcasterUser | null | undefined): boolean {
  if (!user) return false;
  const username = (user.username || "").trim().toLowerCase();
  const displayName = (user.displayName || "").trim().toLowerCase();
  return (
    !username ||
    username.startsWith("wallet_") ||
    displayName.includes("...") ||
    displayName.startsWith("0x")
  );
}

function mergeUserWithHostContext(
  user: FarcasterUser | null,
  hostUser: FarcasterUser | null
): FarcasterUser | null {
  if (!user) return null;
  if (!hostUser) return user;
  if (!isFallbackWalletUser(user)) return user;

  return {
    ...user,
    username: hostUser.username || user.username,
    displayName: hostUser.displayName || hostUser.username || user.displayName,
    pfpUrl: user.pfpUrl || hostUser.pfpUrl,
  };
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
  const [hostContextUser, setHostContextUser] = useState<FarcasterUser | null>(null);

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
        const context = sdk.context ? await sdk.context : null;
        if (context?.user?.fid) {
          setHostContextUser({
            fid: context.user.fid,
            username: context.user.username,
            displayName: context.user.displayName,
            pfpUrl: context.user.pfpUrl,
            authType: "farcaster",
          });
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
          const nextUser = mergeUserWithHostContext(data.user || cachedUser, hostContextUser);
          if (!nextUser) {
            throw new Error("Session user is missing");
          }
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
  }, [hostContextUser]);

  useEffect(() => {
    if (!hostContextUser) return;
    setUser((prev) => {
      const merged = mergeUserWithHostContext(prev, hostContextUser);
      if (!merged) return prev;
      if (typeof window !== "undefined" && authToken) {
        window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(merged));
      }
      return merged;
    });
  }, [authToken, hostContextUser]);

  const getEthereumProvider = useCallback(async () => {
    const injectedProvider = getInjectedProvider();
    // In Base App (no Farcaster user context), prefer injected wallet provider first.
    if (!hostContextUser && injectedProvider) {
      return injectedProvider;
    }

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

    return injectedProvider;
  }, [hostContextUser, miniAppSdk]);

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
    if (miniAppSdk?.quickAuth?.getToken) {
      try {
        const quickAuth = await miniAppSdk.quickAuth.getToken();
        const quickAuthToken = quickAuth?.token;
        if (quickAuthToken) {
          const quickAuthRes = await fetch("/api/auth/verify", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${quickAuthToken}`,
            },
            cache: "no-store",
          });

          if (quickAuthRes.ok) {
            const data = (await quickAuthRes.json()) as {
              token?: string;
              user?: FarcasterUser;
            };
            const token = data.token || quickAuthToken;
            const resolvedUser = mergeUserWithHostContext(
              data.user ||
                (hostContextUser
                  ? {
                      fid: hostContextUser.fid,
                      username: hostContextUser.username,
                      displayName: hostContextUser.displayName,
                      pfpUrl: hostContextUser.pfpUrl,
                      authType: "farcaster",
                    }
                  : null),
              hostContextUser
            );
            if (resolvedUser) {
              setAuthToken(token);
              setUser(resolvedUser);
              setIsAuthenticated(true);
              window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
              window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(resolvedUser));
              return;
            }
          }
        }
      } catch {
        // Fall back to wallet signature flow.
      }
    }

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
    const attempts: unknown[][] = [[messageHex, address], [message, address]];

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

    if (!signature) {
      try {
        signature = (await provider.request({
          method: "eth_sign",
          params: [address, messageHex],
        })) as string;
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

    const resolvedUser = mergeUserWithHostContext(data.user, hostContextUser);
    if (!resolvedUser) {
      throw new Error("Invalid auth response");
    }

    setAuthToken(data.token);
    setUser(resolvedUser);
    setIsAuthenticated(true);
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, data.token);
    window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(resolvedUser));
  }, [getEthereumProvider, hostContextUser, miniAppSdk]);

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
