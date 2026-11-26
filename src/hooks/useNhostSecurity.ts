import { startAuthentication } from "@simplewebauthn/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNhost } from "./useNhost";

import type { NhostClient } from "@nhost/nhost-js";
import type { AuthFnName } from "./typeHelper";

function hasElevatedClaim(client: NhostClient, userId: string | undefined) {
  const session = client.getUserSession();
  return !!userId && session?.user?.id === userId &&
    session.decodedToken?.["https://hasura.io/jwt/claims"]?.["x-hasura-auth-elevated"] === userId;
}

type SecurityKey = { id: string; nickname: string };

export function useNhostSecurity(operation?: AuthFnName) {
  const { nhost, userId, elevationMode } = useNhost();
  const current = useRef<{
    nhost: typeof nhost;
    userId: string;
    promise: Promise<SecurityKey[]>;
  } | null>(null);
  const [result, setResult] = useState<{
    nhost: typeof nhost;
    userId: string;
    keys: SecurityKey[];
    loading: boolean;
  }>();

  const loadKeys = useCallback((refresh = false): Promise<SecurityKey[]> => {
    if (!userId) return Promise.resolve([]);
    const cached = current.current;
    if (!refresh && cached?.nhost === nhost && cached.userId === userId) return cached.promise;

    const promise = nhost.graphql.request<{ authUserSecurityKeys: SecurityKey[] }>({
      query: `query securityKeys($userId: uuid!) {
        authUserSecurityKeys(where: { userId: { _eq: $userId } }) { id nickname }
      }`,
      variables: { userId },
    }).then(({ body }) => {
      const keys = body.data?.authUserSecurityKeys;
      if (!keys) throw new Error("Could not load security keys");
      if (current.current?.promise === promise) setResult({ nhost, userId, keys, loading: false });
      return keys;
    }).catch((cause: unknown) => {
      if (current.current?.promise === promise) {
        current.current = null;
        setResult({ nhost, userId, keys: [], loading: false });
      }
      throw cause;
    });
    current.current = { nhost, userId, promise };
    return promise;
  }, [nhost, userId]);

  useEffect(() => {
    if (operation && elevationMode === "disabled") return;
    void loadKeys().catch(() => {}); // Explicit refresh and elevation propagate lookup errors.
    return () => { current.current = null; };
  }, [loadKeys, operation, elevationMode]);

  const refreshSecurityKeys = useCallback(async () => {
    if (!userId) return;
    setResult({ nhost, userId, keys: [], loading: true });
    await loadKeys(true);
  }, [loadKeys, nhost, userId]);
  const isElevated = hasElevatedClaim(nhost, userId);
  const enrollingKey = operation === "addSecurityKey" || operation === "verifyAddSecurityKey";
  const activeResult = result?.nhost === nhost && result.userId === userId ? result : undefined;
  const securityKeys = activeResult?.keys ?? [];
  const checkElevation = useCallback(async () => {
    if (elevationMode === "disabled") return;
    if (!userId) {
      if (elevationMode === "required") throw new Error("Sign in before requesting elevated permissions.");
      return;
    }
    const ensureSameUser = () => {
      const session = nhost.getUserSession();
      if (session?.user?.id !== userId) throw new Error("Session changed during elevation");
      return session.user;
    };

    ensureSameUser();
    if (hasElevatedClaim(nhost, userId)) return;
    const keys = await loadKeys();
    const user = ensureSameUser();
    if (!keys.length) {
      if (elevationMode === "required" && !enrollingKey) throw new Error("Register a security key before requesting elevated permissions.");
      return;
    }
    const { body: optionsJSON } = await nhost.auth.elevateWebauthn();
    const credential = await startAuthentication({ optionsJSON });
    ensureSameUser();
    const { body } = await nhost.auth.verifyElevateWebauthn({ ...(user.email && { email: user.email }), credential });
    ensureSameUser();
    if (!body.session) throw new Error("Failed to get elevated session");
    if (body.session.user?.id !== userId) throw new Error("Elevation returned a session for a different user.");
    nhost.sessionStorage.set(body.session);
    if (!hasElevatedClaim(nhost, userId)) throw new Error("The new session does not grant elevated permissions.");
  }, [elevationMode, enrollingKey, loadKeys, nhost, userId]);

  return {
    hasSecurityKeys: securityKeys.length > 0,
    securityKeys,
    isElevated,
    isLoading: Boolean(userId) && (activeResult?.loading ?? true),
    requiresElevation: !!userId && !isElevated && elevationMode !== "disabled" &&
      (securityKeys.length > 0 || (elevationMode === "required" && !enrollingKey)),
    checkElevation,
    refreshSecurityKeys,
  };
}
