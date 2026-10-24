import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/guard";
import { rpc } from "@/features/quiz/api-helpers";

/** Paper readiness for the review screen: items, keyed items, key and rule versions. */
export async function GET() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  const { data, error } = await rpc<unknown>("exam_admin_papers", { p_actor: actor.id });
  if (error === "not_admin") return NextResponse.json({ error: "not_admin" }, { status: 403 });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json(
    { papers: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
