import "server-only";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/server/supabase";
import { getVerifiedUser } from "@/lib/supabase/server";

/** Personalized game responses must never be cached by a shared cache. */
export function gameJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const unauthenticated = () => gameJson({ error: "unauthenticated" }, 401);

/** Public summaries may be cached briefly at the edge; nothing personal inside. */
export function publicJson(body: unknown, maxAgeSeconds = 30) {
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": `public, max-age=${maxAgeSeconds}, stale-while-revalidate=60` },
  });
}

export async function requireUser() {
  return getVerifiedUser();
}

/**
 * Database functions raise short SQLSTATE-tagged messages; this maps them to the
 * HTTP contract the browser sees, without leaking SQL detail.
 */
export function mapDatabaseError(message: string) {
  if (message.startsWith("insufficient_inventory:")) {
    const available = Number(message.split(":")[1] ?? 0);
    return gameJson({ error: "insufficient_inventory", available }, 409);
  }
  switch (message) {
    case "not_found":
      return gameJson({ error: "not_found" }, 404);
    case "invalid_option":
      return gameJson({ error: "invalid_option" }, 400);
    case "invalid_count":
      return gameJson({ error: "invalid_count" }, 400);
    case "already_answered":
      return gameJson({ error: "already_answered" }, 409);
    case "deadline_passed":
      return gameJson({ error: "deadline_passed" }, 409);
    case "invalid_duration":
      return gameJson({ error: "invalid_duration" }, 400);
    case "unsupported_mode":
      return gameJson({ error: "unsupported_mode" }, 400);
    case "not_ready_to_advance":
      return gameJson({ error: "not_ready_to_advance" }, 409);
    default:
      if (message.startsWith("attempt_not_active:")) {
        return gameJson({ error: "attempt_not_active", status: message.split(":")[1] }, 409);
      }
      if (message.startsWith("attempt_not_startable:")) {
        return gameJson({ error: "attempt_not_startable", status: message.split(":")[1] }, 409);
      }
      if (message.startsWith("stale_position:")) {
        return gameJson({ error: "stale_position", expected: Number(message.split(":")[1]) }, 409);
      }
      return null;
  }
}

const game = () => getServiceClient();

export async function rpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await game().rpc(name as never, args as never);
  if (error) return { data: null, error: error.message } as const;
  return { data: data as T, error: null } as const;
}
