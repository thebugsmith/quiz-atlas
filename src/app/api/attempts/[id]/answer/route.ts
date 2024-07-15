import { submitAnswerSchema } from "@/features/quiz/request-schemas";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

/**
 * Accepts exactly one answer per question. A retry with the same idempotency key
 * returns the stored outcome instead of adding points twice.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = submitAnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return gameJson({ error: "invalid_request" }, 400);
  }

  const { id } = await params;
  const { data, error } = await rpc<Record<string, unknown>>("game_submit_answer", {
    p_attempt_id: id,
    p_owner: user.id,
    p_position: parsed.data.position,
    p_option_id: parsed.data.optionId,
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return mapDatabaseError(error) ?? gameJson({ error: "answer_failed" }, 500);
  }

  return gameJson(data);
}
