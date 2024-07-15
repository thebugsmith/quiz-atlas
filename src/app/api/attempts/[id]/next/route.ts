import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

/** Moves past the answered question. Retrying cannot skip a question. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await params;
  const advanced = await rpc<Record<string, unknown>>("game_advance", {
    p_attempt_id: id,
    p_owner: user.id,
  });
  if (advanced.error) {
    return mapDatabaseError(advanced.error) ?? gameJson({ error: "advance_failed" }, 500);
  }

  const question = await rpc<Record<string, unknown>>("game_current_question", {
    p_attempt_id: id,
    p_owner: user.id,
  });
  if (question.error) return gameJson({ error: "query_failed" }, 500);

  return gameJson({ attempt: advanced.data, question: question.data });
}
