import type { NhostClient } from "@nhost/nhost-js";
import type { ErrorResponse } from "@nhost/nhost-js/auth";
import { FetchError } from "@nhost/nhost-js/fetch";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNhost } from "./useNhost";
import { useNhostSecurity } from "./useNhostSecurity";

type AuthMethods = {
  [K in keyof NhostClient["auth"]]: NhostClient["auth"][K] extends (
          ...args: any[]
      ) => any
      ? NhostClient["auth"][K]
      : never;
};

type AuthFnName = keyof AuthMethods;

type ParamsOf<K extends AuthFnName> = Parameters<AuthMethods[K]>[0];
type DataOf<K extends AuthFnName> = Awaited<ReturnType<AuthMethods[K]>>;

interface UseAuthHandlerOptions<K extends AuthFnName> {
  fn: K;
  onSuccess?: ({
                 nhost,
                 data,
                 params
               }: {
    nhost: NhostClient;
    data: DataOf<K>;
    params: ParamsOf<K>;
  }) => Promise<void | undefined> | void;
  onError?: ({
               nhost,
               error,
               params
             }: {
    nhost: NhostClient;
    error: FetchError<ErrorResponse>;
    params: ParamsOf<K>;
  }) => Promise<void | undefined> | void;
}

export function useNhostAuthElevated<K extends AuthFnName>({
                                                     fn,
                                                     onSuccess,
                                                     onError,
                                                   }: UseAuthHandlerOptions<K>) {
  const {nhost} = useNhost();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<FetchError<ErrorResponse> | null>(null);
  const { requiresElevation, checkElevation } = useNhostSecurity();
  // Auto-stabilize callbacks ---
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const callAsync = useCallback(
      async (
          params: ParamsOf<K>
      ): Promise<DataOf<K> | FetchError<ErrorResponse>> => {
        setIsLoading(true);
        setError(null);
        setIsSuccess(false);

        try {
          if(requiresElevation) {
            await checkElevation();
          }
          const fnToCall = nhost.auth[fn] as AuthMethods[K];
          const result = await fnToCall(params);
          // Always call the latest callback
          if (onSuccessRef.current) {
            await onSuccessRef.current({ nhost, data: result, params });
          }
          setIsSuccess(true);
          return result;
        } catch (e) {
          const fetchError = e as FetchError<ErrorResponse>;
          setError(fetchError);
          if (onErrorRef.current) {
            await onErrorRef.current({ nhost, error: fetchError, params });
          }
          return fetchError;
        } finally {
          setIsLoading(false);
        }
      },
      [nhost, fn, checkElevation, requiresElevation]
  );

  return {callAsync, isLoading, isSuccess, error};
}