import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { serverEnv } from "./env";

let cached: SupabaseClient<Database> | null = null;

/**
 * Privileged client. It bypasses RLS, so every caller must check ownership itself.
 * Only server modules import this; it must never reach a client component bundle.
 */
export function getServiceClient(): SupabaseClient<Database> {
  if (cached) return cached;

  if (typeof window !== "undefined") {
    throw new Error("getServiceClient must not be imported into client code");
  }

  cached = createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}
