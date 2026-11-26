import type { NhostClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/auth";

import { type PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { NhostContext, type ElevationMode } from "./NhostContext";

import { exchangePKCE } from "./pkce";

export type NhostProviderProps = PropsWithChildren<{ nhostClient: NhostClient; pkceCallbackPath?: string; elevationMode?: ElevationMode }>;

export function NhostProvider({ children, nhostClient, pkceCallbackPath, elevationMode = "disabled" }: NhostProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [callbackError, setCallbackError] = useState<Error | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [pendingSignOuts, setPendingSignOuts] = useState(0);
  const isLoading = initializing || pendingSignOuts > 0;
  const exchange = useRef<{ client: NhostClient; legacy: boolean; promise: Promise<unknown> } | null>(null);
  const user = session?.user ?? null;
  const isAuthenticated = session !== null;

  useEffect(() => {
    const unsubscribe = nhostClient.sessionStorage.onChange(setSession);
    const syncFromClient = () => setSession(nhostClient.getUserSession());
    window.addEventListener("storage", syncFromClient);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", syncFromClient);
    };
  }, [nhostClient]);

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const refreshToken = url.searchParams.get("refreshToken");
    const isVerificationPage = url.pathname === pkceCallbackPath;
    const code = isVerificationPage ? url.searchParams.get("code") : null;
    if (code || refreshToken) {
      if (isVerificationPage) url.searchParams.delete("code");
      url.searchParams.delete("refreshToken");
      window.history.replaceState(window.history.state, "", url.href);
      const promise = code
        ? exchangePKCE(nhostClient, code)
        : nhostClient.auth.refreshToken({ refreshToken: refreshToken! });
      exchange.current = { client: nhostClient, legacy: !code, promise };
      setCallbackError(null);
    }
    const finish = () => {
      if (active) {
        exchange.current = null;
        setSession(nhostClient.getUserSession());
        setInitializing(false);
      }
    };
    if (exchange.current?.client === nhostClient) {
      setInitializing(true);
      const { promise, legacy } = exchange.current;
      void promise.then(finish, (cause: unknown) => {
        if (active && legacy) window.location.reload();
        if (active && !legacy) setCallbackError(cause instanceof Error ? cause : new Error(String(cause)));
        finish();
      });
    } else {
      setCallbackError(isVerificationPage && !nhostClient.getUserSession()
        ? new Error("The verification link is missing its authorization code.")
        : null);
      finish();
    }
    return () => { active = false; };
  }, [nhostClient, pkceCallbackPath]);

  // Proactively refresh after idle/background. visibilitychange covers tab switches
  // and minimized windows; window blur/focus covers losing OS focus while the tab
  // stays "visible" (e.g. another app in front). Both can fire together — the
  // in-flight guard dedupes network calls. React updates come from onChange above.
  useEffect(() => {
    let refreshInFlight: Promise<unknown> | null = null;
    let wasTabHidden = false;
    let wasWindowBlurred = false;

    const refreshSessionAfterIdle = () => {
      if (!nhostClient.getUserSession() || refreshInFlight) {
        return;
      }
      refreshInFlight = nhostClient.refreshSession().finally(() => {
        refreshInFlight = null;
      });
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        wasTabHidden = true;
        return;
      }
      if (wasTabHidden) {
        wasTabHidden = false;
        wasWindowBlurred = false;
        refreshSessionAfterIdle();
      }
    };

    const onWindowBlur = () => {
      wasWindowBlurred = true;
    };

    const onWindowFocus = () => {
      if (document.hidden || !wasWindowBlurred) {
        return;
      }
      wasWindowBlurred = false;
      refreshSessionAfterIdle();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [nhostClient]);

  const authContext = useMemo(() => {
    const signOut = async () => {
      if (!session?.refreshToken) return;
      setPendingSignOuts(count => count + 1);
      try {
        await nhostClient.auth.signOut({ refreshToken: session.refreshToken });
      } finally {
        setPendingSignOuts(count => count - 1);
      }
    };
    const refreshSession = async () => {
      await nhostClient.refreshSession(0);
    };
    return {
      user,
      session,
      isAuthenticated,
      isLoading,
      elevationMode,
      callbackError,
      nhost: nhostClient,
      userId: user?.id,
      signOut,
      refreshSession,
    };
  }, [user, isLoading, nhostClient, session, isAuthenticated, callbackError, elevationMode]);

  return <NhostContext.Provider value={authContext}>{children}</NhostContext.Provider>;
}
