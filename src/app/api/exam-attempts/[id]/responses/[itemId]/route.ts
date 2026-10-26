import { responsePatch } from "@/features/exam/request-schemas";
import { examApiHidden, examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";
import { consume, LIMITS } from "@/features/ops/limits";

/**
 * One edit of one response. The body carries the revision the client last saw and a
 * mutation key; the database decides whether this is new, a duplicate, or a conflict.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = responsePatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const budget = await consume(
    `exam-save:${user.id}`,
    LIMITS.examSave.limit,
    LIMITS.examSave.window,
  );
  if (!budget.allowed) {
    return gameJson({ error: "rate_limited", resetAt: budget.resetAt }, 429);
  }

  const { id, itemId } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_set_response", {
    p_attempt_id: id,
    p_owner: user.id,
    p_item_id: itemId,
    p_response: parsed.data.response,
    p_expected_revision: parsed.data.expected_revision,
    p_mutation_key: parsed.data.mutation_key,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  if (data && typeof data === "object" && "error" in data && data.error === "deadline_passed") {
    return gameJson({ error: "deadline_passed", state: "submitted" }, 409);
  }
  return gameJson(data);
}
