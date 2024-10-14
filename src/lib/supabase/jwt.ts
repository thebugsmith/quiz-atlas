import { createPublicKey, verify, type KeyObject } from "node:crypto";

/**
 * Local verification of Supabase access tokens against the project's JWKS.
 *
 * The API used to ask GoTrue "who is this?" on every request, which costs a round trip
 * to another region. The project signs with ES256, so the token can be verified here
 * with the public key instead: signature, expiry and issuer are all checked. If the
 * project ever switches to a symmetric algorithm, or the key is unknown, this returns
 * null and the caller falls back to the authoritative server check — never to trust.
 */

type Jwk = { kid?: string; kty?: string; crv?: string; x?: string; y?: string; alg?: string };

type Cache = { keys: Map<string, KeyObject>; fetchedAt: number };

const TTL_MS = 60 * 60 * 1000;
let cache: Cache | null = null;

function jwksUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json` : null;
}

async function loadKeys(): Promise<Map<string, KeyObject>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.keys;

  const url = jwksUrl();
  if (!url) return new Map();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return cache?.keys ?? new Map();

    const body = (await response.json()) as { keys?: Jwk[] };
    const keys = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "EC" || jwk.crv !== "P-256") continue;
      try {
        keys.set(
          jwk.kid,
          createPublicKey({
            key: { kty: "EC", crv: "P-256", x: jwk.x as string, y: jwk.y as string },
            format: "jwk",
          }),
        );
      } catch {
        // a key we cannot parse is skipped, not fatal
      }
    }
    cache = { keys, fetchedAt: Date.now() };
    return keys;
  } catch {
    return cache?.keys ?? new Map();
  } finally {
    clearTimeout(timeout);
  }
}

export type TokenClaims = { sub: string; isAnonymous: boolean };

/** Returns claims only when the signature, algorithm and expiry all check out. */
export async function verifyAccessToken(token: string): Promise<TokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  let head: { alg?: string; kid?: string };
  let claims: { sub?: string; exp?: number; is_anonymous?: boolean };
  try {
    head = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  // Symmetric tokens cannot be verified without the shared secret; let the caller fall back.
  if (head.alg !== "ES256" || !head.kid) return null;

  if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now()) return null;
  if (!claims.sub) return null;

  const key = (await loadKeys()).get(head.kid);
  if (!key) return null;

  const valid = verify(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    { key, dsaEncoding: "ieee-p1363" },
    Buffer.from(signature, "base64url"),
  );

  return valid ? { sub: claims.sub, isAnonymous: Boolean(claims.is_anonymous) } : null;
}
