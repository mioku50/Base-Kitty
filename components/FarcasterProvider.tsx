"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { sdk } from "@farcaster/miniapp-sdk";

interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

interface FarcasterCtx {
  user: FarcasterUser | null;
  isSDKLoaded: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
  composeCast: (text: string) => Promise<void>;
}

const FarcasterContext = createContext<FarcasterCtx>({
  user: null,
  isSDKLoaded: false,
  isAuthenticated: false,
  signIn: async () => {},
  composeCast: async () => {},
});

export const useFarcaster = () => useContext(FarcasterContext);

export default function FarcasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize SDK and signal ready
  useEffect(() => {
    let readyCalled = false;
    const safeReady = () => {
      if (readyCalled) return;
      try {
        sdk.actions.ready();
        readyCalled = true;
      } catch {
        // Ignore outside mini app context.
      }
    };

    // Call ready as early as possible to avoid splash warnings in host clients.
    safeReady();
    const readyRetryTimer = window.setTimeout(safeReady, 800);

    const init = async () => {
      try {
        // Load SDK context (works inside Farcaster clients)
        const ctx = await sdk.context;
        if (ctx?.user) {
          setUser({
            fid: ctx.user.fid,
            username: ctx.user.username ?? undefined,
            displayName: ctx.user.displayName ?? undefined,
            pfpUrl: ctx.user.pfpUrl ?? undefined,
          });
        }
      } catch {
        // Not inside Farcaster client — that's okay
        console.log("[FC] Not running inside Farcaster client");
      }
      setIsSDKLoaded(true);
      safeReady();
    };

    init();

    return () => {
      window.clearTimeout(readyRetryTimer);
    };
  }, []);

  // Quick Auth sign-in
  const signIn = useCallback(async () => {
    try {
      const { token } = await sdk.quickAuth.getToken();

      // Verify token on our backend
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error("[FC] Quick Auth failed:", err);
    }
  }, []);

  // Compose a cast via SDK
  const composeCast = useCallback(async (text: string) => {
    try {
      await sdk.actions.composeCast({ text });
    } catch (err) {
      console.error("[FC] composeCast failed:", err);
      // Fallback: open Warpcast intent in new tab
      const encoded = encodeURIComponent(text);
      window.open(
        `https://warpcast.com/~/compose?text=${encoded}`,
        "_blank"
      );
    }
  }, []);

  return (
    <FarcasterContext.Provider
      value={{ user, isSDKLoaded, isAuthenticated, signIn, composeCast }}
    >
      {children}
    </FarcasterContext.Provider>
  );
}
