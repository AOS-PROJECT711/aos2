import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type AccountSession = {
  user: User | null;
  ready: boolean;
};

export const AccountSessionContext = createContext<AccountSession>({
  user: null,
  ready: false,
});

export function useAccountSession() {
  return useContext(AccountSessionContext);
}