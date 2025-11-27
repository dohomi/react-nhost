import type { NhostClient } from "@nhost/nhost-js";
import { FetchError } from "@nhost/nhost-js/fetch";
import type { ErrorResponse } from "@nhost/nhost-js/storage";
import { useCallback } from "react";
import type { DataOfStorage, FirstParamOfStorage, ParamsOfStorage, StorageFnName, StorageMethods } from "./typeHelper";
import { useShared } from "./useShared";



interface StorageHandlerOptions<K extends StorageFnName> {
  fn: K;
  onSuccess?: ({
                 nhost,
                 data,
                 params,
               }: {
    nhost: NhostClient;
    data: DataOfStorage<K>;
    params: FirstParamOfStorage<K>;
  }) => Promise<void | undefined> | void;
  onError?: ({
               nhost,
               error,
               params,
             }: {
    nhost: NhostClient;
    error: FetchError<ErrorResponse>;
    params: FirstParamOfStorage<K>;
  }) => Promise<void | undefined> | void;
}

export function useNhostStorage<K extends StorageFnName>({
  fn,
  onSuccess,
  onError,
}: StorageHandlerOptions<K>) {

  const {callAsync, isLoading, isSuccess, error, nhost} = useShared({
    onSuccess,
    onError,
  });

  const caller = useCallback(
    async (...params: ParamsOfStorage<K>) => {
      const method = nhost.storage[fn] as StorageMethods[K];
      return callAsync<DataOfStorage<K>, ParamsOfStorage<K>>(
        (...p) => method(...p),
        ...params
      );
    },
    [nhost, fn, callAsync]
  );

  return {
    callAsync: caller,
    isLoading,
    isSuccess,
    error: error as FetchError<ErrorResponse> | null,
  };
}
