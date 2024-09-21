import { createAttemptSchema } from "@/features/quiz/request-schemas";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

/**
 * Creates a ready attempt with a frozen question set. The browser sends its intent;
 * the server decides which questions exist, in what order, with which option order,
 * and, for Time Rush, what the queue length is.
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

  const { mode, source, topics, difficulty, count, durationSeconds, idempotencyKey } = parsed.data;

  if (mode === "practice") {
    const practice = await rpc<{
      attempt_id: string;
      status: string;
      mode: string;
      question_count: number;
      reused: boolean;
    }>("game_create_practice_attempt", {
      p_attempt_id: crypto.randomUUID(),
      p_owner: user.id,
      p_seed: crypto.randomUUID(),
      p_source: source,
      p_topics: topics,
      p_difficulty: difficulty,
      p_count: count,
      p_create_key: idempotencyKey,
    });

    if (practice.error || !practice.data) {
      const mapped = practice.error ? mapDatabaseError(practice.error) : null;
      return mapped ?? gameJson({ error: "create_failed" }, 500);
    }
    return gameJson(practice.data, practice.data.reused ? 200 : 201);
  }

  if (mode === "survival") {
    const survival = await rpc<{
      attempt_id: string;
      status: string;
      mode: string;
      question_count: number;
      lives: number;
      reused: boolean;
    }>("game_create_survival_attempt", {
      p_attempt_id: crypto.randomUUID(),
      p_owner: user.id,
      p_seed: crypto.randomUUID(),
      p_topics: topics,
      p_difficulty: difficulty,
      p_count: 50,
      p_create_key: idempotencyKey,
    });

    if (survival.error || !survival.data) {
      const mapped = survival.error ? mapDatabaseError(survival.error) : null;
      return mapped ?? gameJson({ error: "create_failed" }, 500);
    }
    return gameJson(survival.data, survival.data.reused ? 200 : 201);
  }

  const { data, error } = await rpc<{
    attempt_id: string;
    status: string;
    mode: string;
    question_count: number;
    reused: boolean;
  }>("game_create_attempt", {
    p_attempt_id: crypto.randomUUID(),
    p_owner: user.id,
    p_seed: crypto.randomUUID(),
    p_mode: mode,
    p_topics: topics,
    p_difficulty: difficulty,
    p_count: count,
    p_duration_seconds: durationSeconds ?? null,
    p_create_key: idempotencyKey,
  });

  if (error || !data) {
    const mapped = error ? mapDatabaseError(error) : null;
    return mapped ?? gameJson({ error: "create_failed" }, 500);
  }

  return gameJson(data, data.reused ? 200 : 201);
}
