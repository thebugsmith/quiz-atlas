import { submitAnswerSchema } from "@/features/quiz/request-schemas";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";
import { getServiceClient } from "@/server/supabase";

/**
 * Accepts exactly one action per question — an answer or a skip. A retry with the
 * same idempotency key returns the stored outcome instead of scoring twice.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = submitAnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return gameJson(
      { error: "invalid_request", issues: parsed.error.issues.map((issue) => issue.message) },
      400,
    );
  }

  const { id } = await params;

  // A daily attempt acknowledges the submission and nothing else until the window
  // closes: no correctness, no correct option, no explanation, no running score.
  const attempt = await getServiceClient()
    .from("attempts")
    .select("mode")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  const fn = attempt.data?.mode === "daily" ? "game_submit_daily_answer" : "game_submit_answer";

  const { data, error } = await rpc<Record<string, unknown>>(fn, {
    p_attempt_id: id,
    p_owner: user.id,
    p_position: parsed.data.position,
    p_option_id: parsed.data.optionId,
    p_action: parsed.data.action,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return mapDatabaseError(error) ?? gameJson({ error: "answer_failed" }, 500);
  }

  return gameJson(data);
}
