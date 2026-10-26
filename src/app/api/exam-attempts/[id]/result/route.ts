import { examApiHidden, examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/** The graded result, with the key released because the attempt is submitted. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_result", {
    p_attempt_id: id,
    p_owner: user.id,
  });

  if (error) {
    if (error === "not_submitted") return gameJson({ error: "not_submitted" }, 409);
    return examError(error) ?? gameJson({ error: "failed" }, 500);
  }
  return gameJson(data);
}
