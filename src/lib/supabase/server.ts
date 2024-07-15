import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/**
 * User-scoped server client: it carries the caller's auth cookies, so RLS applies
 * exactly as it would in the browser. Use this for anything that answers "what may
 * this player read?"; use the service client only for server-decided work.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: the middleware refreshes the session instead.
        }
      },
    },
  });
}

export type VerifiedUser = { id: string; isAnonymous: boolean };

/**
 * Identity from a verified session. `getUser()` validates the JWT with Supabase
 * Auth; `getSession()` alone trusts whatever the cookie says, so it is never used
 * to decide ownership.
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, isAnonymous: Boolean(data.user.is_anonymous) };
}
