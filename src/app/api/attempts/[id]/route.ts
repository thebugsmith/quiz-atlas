import { getServiceClient } from "@/server/supabase";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/** Safe resume state: status, score and the current question only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await params;
  const { data: attempt, error } = await getServiceClient()
    .from("attempts")
    .select("id, mode, status, score, question_count, current_position, started_at, finished_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) return gameJson({ error: "query_failed" }, 500);
  if (!attempt) return gameJson({ error: "not_found" }, 404);

  if (attempt.status !== "active") {
    return gameJson({ attempt, question: null });
  }

  const question = await rpc<Record<string, unknown>>("game_current_question", {
    p_attempt_id: id,
    p_owner: user.id,
  });
  if (question.error) return gameJson({ error: "query_failed" }, 500);

  return gameJson({ attempt, question: question.data });
}
