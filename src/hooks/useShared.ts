import type { NhostClient } from "@nhost/nhost-js";
import type { FetchError } from "@nhost/nhost-js/fetch";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNhost } from "./useNhost";

// Browser and callback failures have no HTTP response.
type LocalError = Error & { body?: undefined; status?: undefined; headers?: undefined };
export type OperationError<E> = FetchError<E> | LocalError;

export interface HandlerOptions<R, P, E> {
  onSuccess?: (args: { nhost: NhostClient; data: R; params: P }) => Promise<void> | void;
  onError?: (args: { nhost: NhostClient; error: OperationError<E>; params: P }) => Promise<void> | void;
}

export function useShared<R, P extends unknown[], E>(options: HandlerOptions<R, P[0], E>) {
  const { nhost } = useNhost();
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  }, [options]);

  const latest = useRef(0);
  const [pending, setPending] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<OperationError<E> | null>(null);

  const callAsync = useCallback(async (method: (...args: P) => R | Promise<R>, ...params: P): Promise<R | OperationError<E>> => {
    const id = ++latest.current;
    setPending(count => count + 1);
    setIsSuccess(false);
    setError(null);
    try {
      const data = await method(...params);
      await callbacks.current.onSuccess?.({ nhost, params: params[0], data });
      if (latest.current === id) setIsSuccess(true);
      return data;
    } catch (cause) {
      const failure: OperationError<E> = cause instanceof Error ? cause : new Error(String(cause));
      if (latest.current === id) setError(failure);
      await callbacks.current.onError?.({ nhost, params: params[0], error: failure });
      return failure;
    } finally {
      setPending(count => count - 1);
    }
  }, [nhost]);

  return { nhost, callAsync, isLoading: pending > 0, isSuccess, error };
}
