import type { ErrorResponse } from "@nhost/nhost-js/auth";
import { useCallback } from "react";
import type { AuthFnName, DataOfAuth, ParamsOfAuth, UseAuthHandlerOptions } from "./typeHelper";
import { useShared } from "./useShared";

export function useNhostAuth<K extends AuthFnName>(options: UseAuthHandlerOptions<K>) {
  const { fn } = options;
  const { callAsync, nhost, ...state } = useShared<DataOfAuth<K>, ParamsOfAuth<K>, ErrorResponse>(options);

  const caller = useCallback((...params: ParamsOfAuth<K>) => {
    // TypeScript loses the correlation between the selected key and its signature at lookup.
    const method = nhost.auth[fn] as (...args: ParamsOfAuth<K>) => DataOfAuth<K> | Promise<DataOfAuth<K>>;
    return callAsync(method, ...params);
  }, [callAsync, nhost, fn]);

  return { callAsync: caller, ...state };
}
