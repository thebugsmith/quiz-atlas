import { markedPatch } from "@/features/exam/request-schemas";
import { examApiHidden, examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/** Mark for review, kept apart from the answer so a flag never rewrites a response. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = markedPatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_set_marked", {
    p_attempt_id: id,
    p_owner: user.id,
    p_item_id: parsed.data.item_id,
    p_marked: parsed.data.marked,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson(data);
}
