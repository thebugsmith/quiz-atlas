import { z } from "zod";
import { NextResponse } from "next/server";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3).max(500),
});

/** Voiding affects rankings, never stored scores; every void is audited. */
export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { data, error } = await rpc<Record<string, unknown>>("admin_void_daily_challenge", {
    p_actor: actor.id,
    p_date: parsed.data.date,
    p_reason: parsed.data.reason,
  });

  if (error || !data) {
    return adminError(error ?? "") ?? NextResponse.json({ error: "void_failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}
