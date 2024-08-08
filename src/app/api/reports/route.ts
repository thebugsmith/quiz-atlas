import { z } from "zod";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

const reportSchema = z.object({
  questionVersionId: z.string().uuid(),
  attemptId: z.string().uuid().nullable().default(null),
  reason: z.enum(["incorrect_answer", "ambiguous", "outdated", "typo", "inappropriate", "other"]),
  details: z.string().trim().max(1000).nullable().default(null),
});

/** A report is anchored to the version the player actually saw, never to "the question". */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return gameJson({ error: "invalid_request" }, 400);
  }

  const input = parsed.data;
  const { data, error } = await rpc<{ report_id: string; status: string }>("game_report_question", {
    p_reporter: user.id,
    p_question_version_id: input.questionVersionId,
    p_attempt_id: input.attemptId,
    p_reason: input.reason,
    p_details: input.details,
  });

  if (error || !data) {
    return mapDatabaseError(error ?? "") ?? gameJson({ error: "report_failed" }, 500);
  }
  return gameJson(data, 201);
}
