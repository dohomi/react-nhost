import { NhostContext, type NhostContextProps } from "../NhostContext";
import { useContext } from "react";

export const useNhost = (): NhostContextProps => {
  const context = useContext(NhostContext);
  if (!context) {
    throw new Error("useNhost must be used within NhostProvider");
  }
  return context;
};