import { z } from "zod";
import { examApiHidden, examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

const body = z.object({ item_id: z.string().uuid(), body: z.string().max(4000) }).strict();

/** Private notes never leave the owner's attempt; an empty body clears the note. */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_note_set", {
    p_attempt_id: id,
    p_owner: user.id,
    p_item_id: parsed.data.item_id,
    p_body: parsed.data.body,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson(data);
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_note_list", {
    p_attempt_id: id,
    p_owner: user.id,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson({ notes: data ?? {} });
}
