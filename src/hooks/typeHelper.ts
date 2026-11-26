import type { NhostClient } from "@nhost/nhost-js";
import type { ErrorResponse } from "@nhost/nhost-js/auth";
import type { HandlerOptions } from "./useShared";

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never
}[keyof T];

export type AuthFnName = MethodNames<NhostClient["auth"]>;
export type StorageFnName = MethodNames<NhostClient["storage"]>;
export type ParamsOfAuth<K extends AuthFnName> = Parameters<NhostClient["auth"][K]>;
export type ParamsOfStorage<K extends StorageFnName> = Parameters<NhostClient["storage"][K]>;
export type DataOfAuth<K extends AuthFnName> = Awaited<ReturnType<NhostClient["auth"][K]>>;
export type DataOfStorage<K extends StorageFnName> = Awaited<ReturnType<NhostClient["storage"][K]>>;

export type UseAuthHandlerOptions<K extends AuthFnName> =
  HandlerOptions<DataOfAuth<K>, ParamsOfAuth<K>[0], ErrorResponse> & { fn: K };
