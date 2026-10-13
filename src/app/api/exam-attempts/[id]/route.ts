import { examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

const ROUTE = "GET /api/exam-attempts/[id]";

/** The safe manifest: items, options and this owner's saved responses. No keys. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_attempt_manifest", {
    p_attempt_id: id,
    p_owner: user.id,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  if (!data) return gameJson({ error: "not_found" }, 404);
  return gameJson(data);
}

void ROUTE;
