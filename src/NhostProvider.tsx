import type { NhostClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/auth";

import {
  type PropsWithChildren,
  useCallback,
  useEffect, useMemo,
  useRef,
  useState,
} from "react";
import { NhostContext } from "./NhostContext";


export type NhostProviderProps = PropsWithChildren<
    { nhostClient: NhostClient }
>;

export function NhostProvider({children, nhostClient}: NhostProviderProps) {
  const [user, setUser] = useState<Session["user"] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const lastRefreshTokenIdRef = useRef<string | null>(null);

  const reloadSession = useCallback((currentRefreshTokenId: string | null) => {
    if (currentRefreshTokenId !== lastRefreshTokenIdRef.current) {
      lastRefreshTokenIdRef.current = currentRefreshTokenId;
      // Update local authentication state to match current session
      const currentSession = nhostClient.getUserSession();
      setUser(currentSession?.user || null);
      setSession(currentSession);
      setIsAuthenticated(!!currentSession);
    }
  }, [nhostClient]);


  // Initialize authentication state and set up cross-tab session synchronization
  useEffect(() => {
    const unsubscribe = nhostClient.sessionStorage.onChange((session) => {
      reloadSession(session?.refreshTokenId ?? null);
    });
    const storageEventListener = (event: StorageEvent) => {
      if (event.key === "nhostSession") {
        const newSession: Session | null = event.newValue
            ? JSON.parse(event.newValue)
            : null;
        reloadSession(newSession?.refreshTokenId ?? null);
      }
    };

    window.addEventListener("storage", storageEventListener);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", storageEventListener);
    };
  }, [reloadSession, nhostClient]);

  useEffect(() => {
    async function initializeSession() {
      setIsLoading(true);
      const refreshTokenSearchParam = new URLSearchParams(
          window.location.search,
      ).get("refreshToken");
      if (refreshTokenSearchParam) {
        const removeRefreshToken = () => {
          const url = new URL(window.location.href);
          url.searchParams.delete("refreshToken");
          window.history.replaceState({}, "", url.href);
        };
        try {
          await nhostClient.auth.refreshToken({
            refreshToken: refreshTokenSearchParam,
          });
        } catch {
          removeRefreshToken();
          window.location.reload();
        } finally {
          removeRefreshToken();
        }
      }
      const currentSession = nhostClient.getUserSession();
      setUser(currentSession?.user || null);
      setSession(currentSession);
      setIsAuthenticated(!!currentSession);
      lastRefreshTokenIdRef.current = currentSession?.refreshTokenId ?? null;
      setIsLoading(false);
    }

    void initializeSession();
  }, [nhostClient]);

  useEffect(() => {
    const checkSessionOnFocus = () => {
      reloadSession(nhostClient.getUserSession()?.refreshTokenId ?? null);
    };
    const checkVisibilityChange = () => {
      if (!document.hidden) {
        checkSessionOnFocus();
      }
    };

    // Monitor page visibility changes (tab switching, window minimizing)
    document.addEventListener("visibilitychange", checkVisibilityChange);

    // Monitor window focus events (clicking back into the browser window)
    window.addEventListener("focus", checkSessionOnFocus);

    // Cleanup event listeners on component unmount
    return () => {
      document.removeEventListener("visibilitychange", checkVisibilityChange);
      window.removeEventListener("focus", checkSessionOnFocus);
    };
  }, [reloadSession, nhostClient]);

  const signOut = useCallback(async () => {
        if (!session?.refreshToken) return;
        setIsLoading(true);
        await nhostClient.auth.signOut({
          refreshToken: session.refreshToken,
        });
        setUser(null);
        setSession(null);
        setIsAuthenticated(false);
        setIsLoading(false);
      },
      [nhostClient, session]
  );


  const refreshSession = useCallback(
      async () => {
        const newSession = await nhostClient.refreshSession(0);
        setUser(newSession?.user || null);
        setSession(newSession);
        setIsAuthenticated(!!newSession);
      },
      [nhostClient]
  );

  const authContext = useMemo(() => ({
    user,
    session,
    isAuthenticated,
    isLoading,
    nhost: nhostClient,
    userId: user?.id,
    signOut,
    refreshSession
  }), [user, isLoading, nhostClient, refreshSession, session, isAuthenticated, signOut])

  return <NhostContext.Provider value={authContext}>{children}</NhostContext.Provider>;
}


