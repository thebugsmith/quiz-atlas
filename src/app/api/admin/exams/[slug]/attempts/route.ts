import { NextResponse } from "next/server";
import { requireAdmin } from "@/features/admin/guard";
import { examApiHidden } from "@/features/exam/api";
import { rpc } from "@/features/quiz/api-helpers";

/** Submitted attempts for one paper, for the regrade list. */
export async function GET(_request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  const { slug } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_admin_attempts", {
    p_actor: actor.id,
    p_paper_slug: slug,
  });
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json(
    { attempts: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
