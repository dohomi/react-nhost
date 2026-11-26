import type { ErrorResponse } from "@nhost/nhost-js/storage";
import { useCallback } from "react";
import type { StorageFnName, DataOfStorage, ParamsOfStorage } from "./typeHelper";
import { useShared, type HandlerOptions } from "./useShared";

export function useNhostStorage<K extends StorageFnName>(options: HandlerOptions<DataOfStorage<K>, ParamsOfStorage<K>[0], ErrorResponse> & { fn: K }) {
  const { fn } = options;
  const { callAsync, nhost, ...state } = useShared<DataOfStorage<K>, ParamsOfStorage<K>, ErrorResponse>(options);

  const caller = useCallback((...params: ParamsOfStorage<K>) => {
    // TypeScript loses the correlation between the selected key and its signature at lookup.
    const method = nhost.storage[fn] as (...args: ParamsOfStorage<K>) => DataOfStorage<K> | Promise<DataOfStorage<K>>;
    return callAsync(method, ...params);
  }, [callAsync, nhost, fn]);

  return { callAsync: caller, ...state };
}
