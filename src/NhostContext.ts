import type { NhostClient } from "@nhost/nhost-js";
import type { Session } from "@nhost/nhost-js/auth";
import { createContext } from "react";

export type NhostContextProps = {
    userId: string | undefined;
    user: Session["user"] | null;
    session: Session | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    nhost: NhostClient;
    signOut: () => Promise<void>;
    refreshSession: () => Promise<void>;
  }
  
  export const NhostContext = createContext<NhostContextProps | null>(null);