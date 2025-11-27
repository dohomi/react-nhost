import { useCallback } from "react";
import type { AuthFnName, AuthMethods, ParamsOfAuth, UseAuthHandlerOptions } from "./typeHelper";
import { useShared } from "./useShared";

export function useNhostAuth<K extends AuthFnName>({
  fn,
  onSuccess,
  onError,
}: UseAuthHandlerOptions<K>) {
  const { callAsync, isLoading, isSuccess, error, nhost } = useShared({
    onSuccess,
    onError,
  });

  const caller = useCallback(
    async (...params: ParamsOfAuth<K>) => {
      const method = nhost.auth[fn] as AuthMethods[K];
      return callAsync((...p: any[]) => method(...p), ...params);
    },
    [callAsync, nhost, fn]
  );

  return { callAsync: caller, isLoading, isSuccess, error };
}