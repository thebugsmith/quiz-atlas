import { submitAnswerSchema } from "@/features/quiz/request-schemas";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";
import { getServiceClient } from "@/server/supabase";
import { consume, LIMITS } from "@/features/ops/limits";
import { logApi } from "@/features/ops/log";

const ROUTE = "POST /api/attempts/[id]/answer";

async function handle(request: Request, params: Promise<{ id: string }>): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = submitAnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return gameJson(
      { error: "invalid_request", issues: parsed.error.issues.map((issue) => issue.message) },
      400,
    );
  }

  const budget = await consume(`answer:${user.id}`, LIMITS.answer.limit, LIMITS.answer.window);
  if (!budget.allowed) {
    return gameJson({ error: "rate_limited", resetAt: budget.resetAt }, 429);
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

  // One function does the scoring and the advance, so the next question comes back with
  // the result and the player never waits for a second call.
  const { data, error } = await rpc<Record<string, unknown>>("game_answer_and_next", {
    p_attempt_id: id,
    p_owner: user.id,
    p_position: parsed.data.position,
    p_option_id: parsed.data.optionId,
    p_action: parsed.data.action,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_mode: attempt.data?.mode ?? "classic",
  });

  if (error) {
    return mapDatabaseError(error) ?? gameJson({ error: "answer_failed" }, 500);
  }

  return gameJson(data);
}

/**
 * Accepts exactly one action per question: an answer or a skip. A retry with the
 * same idempotency key returns the stored outcome instead of scoring twice.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const response = await handle(request, params);
  logApi({
    route: ROUTE,
    method: "POST",
    status: response.status,
    durationMs: Date.now() - started,
    requestId: request.headers.get("x-request-id") ?? undefined,
    outcome: response.ok ? "ok" : response.status === 429 ? "rate_limited" : "rejected",
  });
  return response;
}
