import type { ErrorResponse as AuthErrorResponse } from "@nhost/nhost-js/auth";
import type { FetchError } from "@nhost/nhost-js/fetch";
import type { ErrorResponse as StorageErrorResponse } from "@nhost/nhost-js/storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNhost } from "./useNhost";

type CombinedError = FetchError<AuthErrorResponse | StorageErrorResponse>;

type SharedSuccessPayload<R, P> = {
  nhost: any;
  data: R;
  params: P;
};

type SharedErrorPayload<P> = {
  nhost: any;
  error: CombinedError;
  params: P;
};

type SharedOptions<
  OnSuccess extends ((arg: any) => any) | undefined,
  OnError extends ((arg: any) => any) | undefined
> = {
  onSuccess?: OnSuccess | undefined;
  onError?: OnError | undefined;
};

export function useShared<
  OnSuccess extends ((arg: any) => any) | undefined,
  OnError extends ((arg: any) => any) | undefined
>({
  onSuccess,
  onError,
}: SharedOptions<OnSuccess, OnError>) {
  const { nhost } = useNhost();

  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<CombinedError | null>(null);

  // Stable callback refs (must explicitly allow undefined now)
  const onSuccessRef = useRef<OnSuccess>(onSuccess);
  const onErrorRef = useRef<OnError>(onError);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const callAsync = useCallback(
    async <R, P extends any[]>(
      cb: (...params: P) => Promise<R>,
      ...params: P
    ): Promise<R | CombinedError> => {
      setIsLoading(true);
      setError(null);
      setIsSuccess(false);

      const firstParam = params[0];

      try {
        const result = await cb(...params);

        if (onSuccessRef.current) {
          const payload: SharedSuccessPayload<R, P[0]> = {
            nhost,
            data: result,
            params: firstParam,
          };

          await onSuccessRef.current(payload);
        }

        setIsSuccess(true);
        return result;
      } catch (e) {
        const fetchError = e as CombinedError;
        setError(fetchError);

        if (onErrorRef.current) {
          const payload: SharedErrorPayload<P[0]> = {
            nhost,
            error: fetchError,
            params: firstParam,
          };

          await onErrorRef.current(payload);
        }

        return fetchError;
      } finally {
        setIsLoading(false);
      }
    },
    [nhost]
  );

  return {
    nhost,
    isLoading,
    isSuccess,
    error,
    callAsync,
  };
}
