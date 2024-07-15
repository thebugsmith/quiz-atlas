"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Browser client. It only ever holds the publishable key, so everything it can do
 * is bounded by RLS; privileged work stays on the server.
 */
export function getBrowserClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase environment is missing");
  cached = createBrowserClient<Database>(url, key);
  return cached;
}
