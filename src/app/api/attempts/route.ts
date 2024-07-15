import { createAttemptSchema } from "@/features/quiz/request-schemas";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

/**
 * Creates a ready Classic attempt with a frozen question set. The browser sends
 * its intent; the server decides which questions exist, in what order, and with
 * which option order.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = createAttemptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return gameJson(
      { error: "invalid_request", issues: parsed.error.issues.map((issue) => issue.message) },
      400,
    );
  }

  const { topics, difficulty, count, idempotencyKey } = parsed.data;
  const { data, error } = await rpc<{
    attempt_id: string;
    status: string;
    question_count: number;
    reused: boolean;
  }>("game_create_classic_attempt", {
    p_attempt_id: crypto.randomUUID(),
    p_owner: user.id,
    p_seed: crypto.randomUUID(),
    p_topics: topics,
    p_difficulty: difficulty,
    p_count: count,
    p_create_key: idempotencyKey,
  });

  if (error || !data) {
    const mapped = error ? mapDatabaseError(error) : null;
    return mapped ?? gameJson({ error: "create_failed" }, 500);
  }

  return gameJson(data, data.reused ? 200 : 201);
}
