import { startAuthentication } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";
import { useNhost } from "./useNhost";

export function useNhostSecurity() {
  const { nhost, user } = useNhost();
  const [securityKeys, setSecurityKeys] = useState<
      Array<{ id: string; nickname: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  // Check if user has elevated permissions
  const isElevated = Boolean(
      nhost.getUserSession()?.decodedToken?.["https://hasura.io/jwt/claims"]?.[
          "x-hasura-auth-elevated"
          ]
  );

  const hasSecurityKeys = securityKeys.length > 0;
  const requiresElevation = !isElevated && hasSecurityKeys;

  const fetchSecurityKeys = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const response = await nhost.graphql.request<{
        authUserSecurityKeys: { id: string; nickname: string }[];
      }>({
        query: `
          query securityKeys($userId: uuid!) {
            authUserSecurityKeys(where: { userId: { _eq: $userId } }) {
              id
              nickname
            }
          }
        `,
        variables: { userId: user.id },
      });

      if (response.body.data?.authUserSecurityKeys) {
        setSecurityKeys(response.body.data.authUserSecurityKeys);
      }
    } catch (error) {
      console.error("Failed to fetch security keys:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, nhost]);

  // Elevate permissions
  const checkElevation = useCallback(async () => {
    if (!requiresElevation) return;

    try {
      // Step 1: Get WebAuthn challenge
      const elevateResponse = await nhost.auth.elevateWebauthn();

      // Step 2: User authenticates with security key
      const credential = await startAuthentication(
          elevateResponse?.body as any
      );

      // Step 3: Verify and get elevated session
      const verifyResponse = await nhost.auth.verifyElevateWebauthn({
        email: nhost.getUserSession()?.user?.email as string,
        credential,
      });

      // Update session with elevated token
      if (verifyResponse.body.session) {
        nhost.sessionStorage.set(verifyResponse.body.session);
      } else {
        throw new Error("Failed to get elevated session");
      }
    } catch (error) {
      console.error("Elevation error:", error);
      throw new Error("Could not elevate permissions");
    }
  }, [requiresElevation, nhost]);

  useEffect(() => {
    void fetchSecurityKeys();
  }, [fetchSecurityKeys]);

  return {
    hasSecurityKeys,
    securityKeys,
    isElevated,
    isLoading,
    requiresElevation,
    checkElevation,
    refreshSecurityKeys: fetchSecurityKeys,
  };
}
