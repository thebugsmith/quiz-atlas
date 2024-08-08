import { z } from "zod";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

const bodySchema = z.object({ idempotencyKey: z.string().min(8).max(100) });

/** Reserves the ranked slot for today and freezes the shared set into an attempt. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

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
