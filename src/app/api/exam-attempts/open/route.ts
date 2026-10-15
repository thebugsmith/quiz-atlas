import { examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/** GET /api/exam-attempts?paper=<slug>: the resumable study attempt, or null. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const paper = new URL(request.url).searchParams.get("paper");
  if (!paper) return gameJson({ error: "invalid_request" }, 400);

  const { data, error } = await rpc<unknown>("exam_open_attempt", {
    p_owner: user.id,
    p_paper_slug: paper,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson({ attempt: data ?? null });
}
