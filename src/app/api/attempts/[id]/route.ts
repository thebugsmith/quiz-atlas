import { NextResponse } from "next/server";
import { createServerSupabase, getVerifiedUser } from "@/lib/supabase/server";

/**
 * One attempt, only if the verified caller owns it. A wrong owner gets the same
 * 404 as a missing id, so the endpoint cannot be used to probe for other players'
 * attempt ids.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("attempts")
    .select("id, owner_id, mode, status, score, question_count, created_at, finished_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "query_failed" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { attempt: data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
