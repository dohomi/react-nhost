import type { NhostClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/auth";
import { createContext } from "react";

export type ElevationMode = "disabled" | "recommended" | "required";

export type NhostContextProps = {
    userId: string | undefined;
    user: Session["user"] | null;
    session: Session | null;
    elevationMode: ElevationMode;
    isAuthenticated: boolean;
    isLoading: boolean;
    callbackError: Error | null;
    nhost: NhostClient;
    signOut: () => Promise<void>;
    refreshSession: () => Promise<void>;
  }
  
  export const NhostContext = createContext<NhostContextProps | null>(null);