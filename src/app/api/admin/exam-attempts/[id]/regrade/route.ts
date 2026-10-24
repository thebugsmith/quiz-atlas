import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/features/admin/guard";
import { rpc } from "@/features/quiz/api-helpers";

const body = z.object({ key_version_id: z.string().uuid().nullable().optional() }).strict();

/** Regrade produces a new row; the original result is never edited. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_admin_regrade", {
    p_actor: actor.id,
    p_attempt_id: id,
    p_key_version_id: parsed.data.key_version_id ?? null,
  });

  if (error === "key_not_for_paper") return NextResponse.json({ error }, { status: 409 });
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json(data);
}
