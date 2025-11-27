import { NhostClient } from "@nhost/nhost-js";
import { ErrorResponse } from "@nhost/nhost-js/auth";
import { FetchError } from "@nhost/nhost-js/fetch";

// extract only the function-like keys and their function types
export type AuthMethods = {
  [K in keyof NhostClient["auth"]]: NhostClient["auth"][K] extends (
    ...args: any[]
  ) => any
    ? NhostClient["auth"][K]
    : never;
};

export type StorageMethods = {
  [K in keyof NhostClient["storage"]]: NhostClient["storage"][K] extends (
    ...args: any[]
  ) => any
    ? NhostClient["storage"][K]
    : never;
};

export type AuthFnName = keyof AuthMethods;
export type StorageFnName = keyof StorageMethods;

// Params as a tuple (distributive infer so overloads keep tuple shape)
export type ParamsOfAuth<K extends AuthFnName> = AuthMethods[K] extends (...args: infer P) => any
  ? P
  : never;
export type ParamsOfStorage<K extends StorageFnName> = StorageMethods[K] extends (...args: infer P) => any
  ? P
  : never;
// First param (or undefined if none)
export type FirstParamOfAuth<K extends AuthFnName> = ParamsOfAuth<K> extends [infer F, ...any[]]
  ? F
  : undefined;
export type FirstParamOfStorage<K extends StorageFnName> = ParamsOfStorage<K> extends [infer F, ...any[]]
  ? F
  : undefined;
// Return/response data
export type DataOfAuth<K extends AuthFnName> = AuthMethods[K] extends (...args: any[]) => infer R
  ? Awaited<R>
  : never;
  
export type DataOfStorage<K extends StorageFnName> = StorageMethods[K] extends (...args: any[]) => infer R
  ? Awaited<R>
  : never;
/* ---------- hook option types ---------- */

export interface UseAuthHandlerOptions<K extends AuthFnName> {
  fn: K;
  onSuccess?: (args: {
    nhost: NhostClient;
    data: DataOfAuth<K>;
    params: FirstParamOfAuth<K>;
  }) => Promise<void> | void;
  onError?: (args: {
    nhost: NhostClient;
    error: FetchError<ErrorResponse>;
    params: FirstParamOfAuth<K>;
  }) => Promise<void> | void;
}