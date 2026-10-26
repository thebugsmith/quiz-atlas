import { z } from "zod";
import { examApiHidden, examError } from "@/features/exam/api";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

const body = z.object({ item_id: z.string().uuid(), on: z.boolean() }).strict();

/** Bookmarks point at the question, not the attempt, so they survive a retake. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const hidden = examApiHidden();
  if (hidden) return hidden;

  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { id } = await ctx.params;
  const { data, error } = await rpc<unknown>("exam_bookmark_toggle", {
    p_owner: user.id,
    p_attempt_id: id,
    p_item_id: parsed.data.item_id,
    p_on: parsed.data.on,
  });

  if (error) return examError(error) ?? gameJson({ error: "failed" }, 500);
  return gameJson(data);
}
