import { NextResponse } from "next/server";
import { createServerSupabase, getVerifiedUser } from "@/lib/supabase/server";

/**
 * Attempts owned by the caller. The query is scoped by the verified user id and
 * RLS additionally restricts what the cookie can see, so a missing check cannot
 * leak another player's history.
 */
export async function GET() {
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("attempts")
    .select("id, mode, status, score, question_count, created_at, finished_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json(
      { error: "query_failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { attempts: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
