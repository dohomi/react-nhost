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
  const lastSessionKeyRef = useRef<string | null>(null);

  const sessionKey = (currentSession: Session | null) =>
    currentSession
      ? `${currentSession.refreshTokenId}:${currentSession.accessToken}`
      : null;

  const applySession = useCallback((currentSession: Session | null) => {
    const key = sessionKey(currentSession);
    if (key === lastSessionKeyRef.current) {
      return;
    }
    lastSessionKeyRef.current = key;
    setUser(currentSession?.user || null);
    setSession(currentSession);
    setIsAuthenticated(!!currentSession);
  }, []);


  // Single source of truth for React state: SDK session storage changes only.
  // Do not call applySession from refreshSession() callbacks — storage.set()
  // already notifies subscribers when the session actually changes.
  useEffect(() => {
    const unsubscribe = nhostClient.sessionStorage.onChange(applySession);

    const onCrossTabStorage = (event: StorageEvent) => {
      if (event.key !== "nhostSession") {
        return;
      }
      const newSession: Session | null = event.newValue
          ? JSON.parse(event.newValue)
          : null;
      applySession(newSession);
    };

    window.addEventListener("storage", onCrossTabStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", onCrossTabStorage);
    };
  }, [applySession, nhostClient]);

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
      applySession(nhostClient.getUserSession());
      setIsLoading(false);
    }

    void initializeSession();
  }, [nhostClient, applySession]);

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
      setIsLoading(true);
      await nhostClient.auth.signOut({
        refreshToken: session.refreshToken,
      });
      applySession(null);
      setIsLoading(false);
    }
    const refreshSession = async () => {
      await nhostClient.refreshSession(0);
    }
    return {
      user,
      session,
      isAuthenticated,
      isLoading,
      nhost: nhostClient,
      userId: user?.id,
      signOut,
      refreshSession
    }
  }, [user, isLoading, nhostClient, session, isAuthenticated, applySession])

  return <NhostContext.Provider value={authContext}>{children}</NhostContext.Provider>;
}


