import "server-only";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/server/supabase";
import { getVerifiedUser } from "@/lib/supabase/server";

export type AdminRole = "admin" | "editor";
export type AdminActor = { id: string; role: AdminRole };

/**
 * Every admin route re-checks the role here. The database functions check it again,
 * so a stale route or a direct PostgREST call still cannot write content.
 */
export async function requireAdmin(): Promise<AdminActor | NextResponse> {
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (user.isAnonymous) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  const { data, error } = await getServiceClient()
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_admin" }, { status: 403 });
  }

  return { id: user.id, role: data.role as AdminRole };
}

export function isDenied(value: AdminActor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Shared mapping so admin endpoints speak the same error vocabulary. */
export function adminError(message: string) {
  if (message === "not_admin") return NextResponse.json({ error: "not_admin" }, { status: 403 });
  if (message === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (message === "topic_not_found") {
    return NextResponse.json({ error: "topic_not_found" }, { status: 400 });
  }
  if (
    message === "invalid_options" ||
    message === "invalid_question_type" ||
    message === "invalid_difficulty"
  ) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  if (message === "question_archived" || message === "nothing_to_publish") {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return null;
}
