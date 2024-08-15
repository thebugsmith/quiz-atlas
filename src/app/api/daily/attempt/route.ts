import { z } from "zod";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";
import { consume, LIMITS } from "@/features/ops/limits";
import { logApi } from "@/features/ops/log";

const bodySchema = z.object({ idempotencyKey: z.string().min(8).max(100) });

/** Reserves the ranked slot for today and freezes the shared set into an attempt. */
export async function POST(request: Request) {
  const started = Date.now();
  const response = await create(request);
  logApi({
    route: "POST /api/daily/attempt",
    method: "POST",
    status: response.status,
    durationMs: Date.now() - started,
    outcome: response.ok ? "ok" : "rejected",
  });
  return response;
}

async function create(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const budget = await consume(
    `daily-start:${user.id}`,
    LIMITS.dailyStart.limit,
    LIMITS.dailyStart.window,
  );
  if (!budget.allowed) {
    return gameJson({ error: "rate_limited", resetAt: budget.resetAt }, 429);
  }

  const { data, error } = await rpc<{
    attempt_id: string;
    status: string;
    question_count: number;
    reused: boolean;
  }>("game_create_daily_attempt", {
    p_owner: user.id,
    p_create_key: parsed.data.idempotencyKey,
  });

  if (error || !data) {
    return mapDatabaseError(error ?? "") ?? gameJson({ error: "daily_create_failed" }, 500);
  }
  return gameJson(data, data.reused ? 200 : 201);
}
