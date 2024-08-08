import { z } from "zod";
import { NextResponse } from "next/server";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("archive"), archived: z.boolean() }),
  z.object({
    action: z.literal("quarantine"),
    quarantined: z.boolean(),
    note: z.string().trim().max(1000).nullable().default(null),
  }),
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const { id } = await params;
  const { data, error } = await rpc<Record<string, unknown>>("admin_question_detail", {
    p_actor: actor.id,
    p_question_id: id,
  });

  if (error || !data) {
    return (
      adminError(error ?? "") ?? NextResponse.json({ error: "detail_failed" }, { status: 500 })
    );
  }
  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const { id } = await params;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  if (parsed.data.action === "publish") {
    const { data, error } = await rpc<Record<string, unknown>>("admin_question_publish", {
      p_actor: actor.id,
      p_question_id: id,
    });
    if (error || !data) {
      return (
        adminError(error ?? "") ?? NextResponse.json({ error: "publish_failed" }, { status: 500 })
      );
    }
    return NextResponse.json(data);
  }

  if (parsed.data.action === "quarantine") {
    const { data, error } = await rpc<Record<string, unknown>>("admin_quarantine_question", {
      p_actor: actor.id,
      p_question_id: id,
      p_quarantine: parsed.data.quarantined,
      p_note: parsed.data.note,
    });
    if (error || !data) {
      return (
        adminError(error ?? "") ??
        NextResponse.json({ error: "quarantine_failed" }, { status: 500 })
      );
    }
    return NextResponse.json(data);
  }

  const { data, error } = await rpc<Record<string, unknown>>("admin_question_archive", {
    p_actor: actor.id,
    p_question_id: id,
    p_archived: parsed.data.archived,
  });
  if (error || !data) {
    return (
      adminError(error ?? "") ?? NextResponse.json({ error: "archive_failed" }, { status: 500 })
    );
  }
  return NextResponse.json(data);
}
