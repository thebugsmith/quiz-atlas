import { createAttempt } from "@/features/exam/request-schemas";
import { examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";
import { consume, LIMITS } from "@/features/ops/limits";

const ROUTE = "POST /api/exam-attempts";

/**
 * Create or resume the study workspace for one paper.
 *
 * The client sends a create key so a double click cannot make two attempts, and papers
 * that are not published are refused unless the server has explicitly allowed synthetic
 * fixtures (development only).
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = createAttempt.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const budget = await consume(
    `exam-create:${user.id}`,
    LIMITS.examCreate.limit,
    LIMITS.examCreate.window,
  );
  if (!budget.allowed) {
    return gameJson({ error: "rate_limited", resetAt: budget.resetAt }, 429);
  }

  const timed = parsed.data.mode === "timed";
  const sections = parsed.data.sections ?? null;
  const { data, error } = timed
    ? await rpc<{ attempt_id: string; created: boolean; state: string }>(
        "exam_create_timed_attempt",
        {
          p_owner: user.id,
          p_paper_slug: parsed.data.paper,
          p_create_key: parsed.data.create_key,
          p_locale: parsed.data.locale ?? "en",
          p_section_ids: sections,
        },
      )
    : await rpc<{ attempt_id: string; created: boolean; state: string }>("exam_create_or_resume", {
        p_owner: user.id,
        p_paper_slug: parsed.data.paper,
        p_mode: parsed.data.mode,
        p_create_key: parsed.data.create_key,
        p_locale: parsed.data.locale ?? "en",
        p_allow_draft: process.env.EXAM_ALLOW_DRAFT === "1",
        p_section_ids: sections,
      });

  if (error) {
    return examError(error) ?? gameJson({ error: "failed" }, 500);
  }

  console.info(
    JSON.stringify({
      ts: new Date().toISOString(),
      kind: "api",
      route: ROUTE,
      attempt: data?.attempt_id ?? null,
      created: data?.created ?? null,
    }),
  );
  return gameJson(data);
}
