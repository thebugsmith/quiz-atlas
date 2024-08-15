import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Two jobs run here: refuse cross-site writes (a cookie-authenticated POST from another
 * origin), and keep the auth cookie fresh so an anonymous session does not quietly
 * expire and take the player's attempts with it.
 *
 * Cookie-authenticated mutations must come from this site. Browsers send Origin on
 * cross-site writes; a request that carries a foreign one is refused before routing.
 * Same-site fetches without an Origin header (some proxies strip it) are allowed when
 * Sec-Fetch-Site says so.
 */
function isForeignWrite(request: NextRequest) {
  if (!MUTATING.has(request.method)) return false;
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;

  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");

  if (origin) {
    try {
      return new URL(origin).host !== request.nextUrl.host;
    } catch {
      return true;
    }
  }
  return site === "cross-site";
}

export async function proxy(request: NextRequest) {
  if (isForeignWrite(request)) {
    return NextResponse.json({ error: "cross_origin" }, { status: 403 });
  }

  // Emailed links land on the site root with a PKCE code. Hand it to the callback
  // route, which exchanges it server-side before any page renders.
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    callback.search = `?code=${encodeURIComponent(code)}`;
    return NextResponse.redirect(callback);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the session so expired tokens are refreshed before the page renders.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
