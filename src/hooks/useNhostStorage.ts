import type { NhostClient } from "@nhost/nhost-js";
import type { ErrorResponse } from "@nhost/nhost-js/storage";
import { FetchError } from "@nhost/nhost-js/fetch";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNhost } from "./useNhost";

type StorageMethods = {
  [K in keyof NhostClient["storage"]]: NhostClient["storage"][K] extends (
          ...args: any[]
      ) => any
      ? NhostClient["storage"][K]
      : never;
};

type StorageFnName = keyof StorageMethods;

type ParamsOf<K extends StorageFnName> = Parameters<StorageMethods[K]>[0];
type DataOf<K extends StorageFnName> = Awaited<ReturnType<StorageMethods[K]>>;

interface StorageHandlerOptions<K extends StorageFnName> {
  fn: K;
  onSuccess?: ({
                 nhost,
                 data,
                 params,
               }: {
    nhost: NhostClient;
    data: DataOf<K>;
    params: ParamsOf<K>;
  }) => Promise<void | undefined> | void;
  onError?: ({
               nhost,
               error,
               params,
             }: {
    nhost: NhostClient;
    error: FetchError<ErrorResponse>;
    params: ParamsOf<K>;
  }) => Promise<void | undefined> | void;
}

export function useNhostStorage<K extends StorageFnName>({
                                                           fn,
                                                           onSuccess,
                                                           onError,
                                                         }: StorageHandlerOptions<K>) {
  const { nhost } = useNhost();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<FetchError<ErrorResponse> | null>(null);

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
          const fnToCall = nhost.storage[fn] as StorageMethods[K];
          const result = await fnToCall(params);

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
      [nhost, fn]
  );

  return { callAsync, isLoading, isSuccess, error };
}
