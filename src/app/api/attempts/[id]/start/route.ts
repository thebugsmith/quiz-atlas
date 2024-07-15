import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

/** Activates the attempt once and releases the first question. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await params;
  const started = await rpc<Record<string, unknown>>("game_start_attempt", {
    p_attempt_id: id,
    p_owner: user.id,
  });
  if (started.error) {
    return mapDatabaseError(started.error) ?? gameJson({ error: "start_failed" }, 500);
  }

  const question = await rpc<Record<string, unknown>>("game_current_question", {
    p_attempt_id: id,
    p_owner: user.id,
  });
  if (question.error) return gameJson({ error: "query_failed" }, 500);

  return gameJson({ attempt: started.data, question: question.data });
}
