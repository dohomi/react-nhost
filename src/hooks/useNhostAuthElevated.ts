import { ErrorResponse } from "@nhost/nhost-js/auth";
import { FetchError } from "@nhost/nhost-js/fetch";
import { useCallback } from "react";
import type { AuthFnName, AuthMethods, ParamsOfAuth, UseAuthHandlerOptions } from "./typeHelper";
import { useNhostSecurity } from "./useNhostSecurity";
import { useShared } from "./useShared";

export function useNhostAuthElevated<K extends AuthFnName>({
                                                     fn,
                                                     onSuccess,
                                                     onError,
                                                   }: UseAuthHandlerOptions<K>) {
  const { requiresElevation, checkElevation } = useNhostSecurity();
  const { callAsync, isLoading, isSuccess, error, nhost} = useShared({
    onSuccess,
    onError,
  });

  const caller = useCallback(
    async (...params: ParamsOfAuth<K>) => {
        if(requiresElevation) {
          await checkElevation();
        }
        const method = nhost.auth[fn] as AuthMethods[K];
        return callAsync((...p: any[]) => method(...p), ...params);
    },
    [callAsync, nhost, fn, requiresElevation, checkElevation]
  );

  return {callAsync: caller, isLoading, isSuccess, error: error as FetchError<ErrorResponse> | null};
}