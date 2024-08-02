import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Landing point for every emailed link (signup confirmation, recovery, email change).
 * The token is exchanged server-side so the session cookies are written here rather
 * than trusted from a query string.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/account";

  const allowed = new Set(["signup", "email", "recovery", "invite", "email_change"]);
  if (!tokenHash || !type || !allowed.has(type)) {
    return NextResponse.redirect(new URL("/account?error=invalid_link", url.origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({
    type: type as "signup" | "email" | "recovery" | "invite" | "email_change",
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(new URL("/account?error=expired_link", url.origin));
  }

  const destination = type === "recovery" ? "/account/reset?mode=set" : `${next}?confirmed=1`;
  return NextResponse.redirect(new URL(destination, url.origin));
}
