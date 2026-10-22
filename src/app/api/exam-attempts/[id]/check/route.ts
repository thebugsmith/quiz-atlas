import { z } from "zod";
import { examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

const body = z.object({ item_id: z.string().uuid() }).strict();

/** Study-only feedback. Marks the attempt's answer and keeps the first unaided response. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_check_item", {
    p_attempt_id: id,
    p_owner: user.id,
    p_item_id: parsed.data.item_id,
  });

  if (error === "feedback_not_allowed") return gameJson({ error: "feedback_not_allowed" }, 403);
  if (error === "no_response") return gameJson({ error: "no_response" }, 409);
  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson(data);
}
