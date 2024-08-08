import { z } from "zod";
import { NextResponse } from "next/server";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";

const resolveSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  note: z.string().trim().max(1000).nullable().default(null),
});

/** Records the decision and its note; it never edits an answer or a score. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const { id } = await params;
  const parsed = resolveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { data, error } = await rpc<Record<string, unknown>>("admin_resolve_report", {
    p_actor: actor.id,
    p_report_id: id,
    p_status: parsed.data.status,
    p_note: parsed.data.note,
  });

  if (error || !data) {
    return (
      adminError(error ?? "") ?? NextResponse.json({ error: "resolve_failed" }, { status: 500 })
    );
  }
  return NextResponse.json(data);
}
