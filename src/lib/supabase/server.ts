import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { verifyAccessToken } from "@/lib/supabase/jwt";
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
 * Identity from a verified session.
 *
 * The access token is verified locally against the project's JWKS (ES256), which is a
 * signature and expiry check — not a cookie read. Only when that is impossible (no
 * token, unknown key, symmetric signing) does this ask Supabase Auth, so ownership is
 * never decided on an unverified claim.
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (token) {
    const claims = await verifyAccessToken(token);
    if (claims) return { id: claims.sub, isAnonymous: claims.isAnonymous };
  }

  const { data: checked, error } = await supabase.auth.getUser();
  if (error || !checked.user) return null;
  return { id: checked.user.id, isAnonymous: Boolean(checked.user.is_anonymous) };
}
