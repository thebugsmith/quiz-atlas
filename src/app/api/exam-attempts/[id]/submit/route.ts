import { examApiHidden, examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/** Submit once. The database is idempotent, so a retried request cannot grade twice. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_submit_attempt", {
    p_attempt_id: id,
    p_owner: user.id,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson(data);
}
