"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

type GuestState =
  | { status: "loading" }
  | { status: "ready"; userId: string; isAnonymous: boolean }
  | { status: "error"; message: string };

const GuestContext = createContext<GuestState>({ status: "loading" });

/**
 * A visitor gets an anonymous Supabase identity the first time they open the setup
 * screen, and that identity is reused on later visits because the session lives in
 * an auth cookie. Refreshing keeps it; clearing site data does not.
 */
export function GuestSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GuestState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const supabase = getBrowserClient();

    async function ensureSession() {
      // Verify against the auth server: a cookie can outlive the user it refers to
      // (for example after a database reset), and trusting it would leave the page
      // "signed in" as nobody.
      const { data, error: verifyError } = await supabase.auth.getUser();
      if (data.user && !verifyError) {
        if (!cancelled) {
          setState({
            status: "ready",
            userId: data.user.id,
            isAnonymous: Boolean(data.user.is_anonymous),
          });
        }
        return;
      }

      if (verifyError) await supabase.auth.signOut();

      const { data: created, error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error || !created.user) {
        setState({ status: "error", message: error?.message ?? "Could not start a guest session" });
        return;
      }
      setState({
        status: "ready",
        userId: created.user.id,
        isAnonymous: Boolean(created.user.is_anonymous),
      });
    }

    void ensureSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <GuestContext.Provider value={value}>{children}</GuestContext.Provider>;
}

export function useGuestSession(): GuestState {
  return useContext(GuestContext);
}
