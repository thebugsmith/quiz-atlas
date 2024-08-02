import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/**
 * Result and per-question review for a finished attempt. The payload carries a
 * `reveal` flag: `full` once an attempt is finished, `aggregate` while it is still
 * active (and, later, while a Daily window is open).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await params;
  const { data, error } = await rpc<Record<string, unknown>>("game_attempt_review", {
    p_attempt_id: id,
    p_owner: user.id,
  });

  if (error) {
    return error === "not_found"
      ? gameJson({ error: "not_found" }, 404)
      : gameJson({ error: "query_failed" }, 500);
  }

  return gameJson(data);
}
