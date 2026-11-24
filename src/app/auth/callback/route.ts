import { NextResponse } from "next/server";
import { createServerSupabase, getVerifiedUser } from "@/lib/supabase/server";

/**
 * PKCE landing point for every Supabase redirect: Google sign-in today, emailed links if
 * they ever come back. The code is exchanged server-side so the session cookies are
 * written by us rather than by a script.
 *
 * A provider can send the browser back without a code: cancelling the Google screen, a
 * misconfigured client, or a blocked popup all arrive as `error`/`error_code` in the query
 * (or the hash, on implicit flows). Those are reported as what they are instead of being
 * flattened into "the link was malformed", which only ever means "no code and no error".
 */
function errorFrom(url: URL) {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const code = url.searchParams.get("error_code") ?? hash.get("error_code");
  const description = url.searchParams.get("error_description") ?? hash.get("error_description");
  const name = url.searchParams.get("error") ?? hash.get("error");
  if (!name && !code && !description) return null;
  return (code ?? description ?? name ?? "unknown").slice(0, 120);
}

/** Only a path on this site; `//host` would be another origin. */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const providerError = errorFrom(url);

  if (!code) {
    // A reload or a back button arrives here without a code. If the browser already has a
    // session there is nothing to report, so send it to the account page instead of
    // claiming the link was broken.
    if (!providerError && (await getVerifiedUser())) {
      return NextResponse.redirect(new URL("/account", url.origin));
    }
    if (providerError) {
      return NextResponse.redirect(
        new URL(
          `/account?error=auth_failed&reason=${encodeURIComponent(providerError)}`,
          url.origin,
        ),
      );
    }
    return NextResponse.redirect(new URL("/account?error=invalid_link", url.origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        kind: "auth",
        route: "GET /auth/callback",
        outcome: "exchange_failed",
        reason: error.message,
      }),
    );
    return NextResponse.redirect(new URL("/account?error=expired_link", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
