import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * PKCE landing point for every Supabase redirect: Google sign-in today, emailed links if
 * they ever come back. The code is exchanged server-side so the session cookies are
 * written by us rather than by a script.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/account";

  if (!code) {
    return NextResponse.redirect(new URL("/account?error=invalid_link", url.origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/account?error=expired_link", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
