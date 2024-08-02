import { z } from "zod";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

const bodySchema = z.object({
  questionId: z.string().uuid(),
  bookmarked: z.boolean(),
});

/** The player's saved questions, described well enough to list and practise. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { data, error } = await rpc<
    Array<{
      question_id: string;
      prompt: string;
      topic_slug: string;
      topic_name: string;
      created_at: string;
    }>
  >("game_list_bookmarks", { p_owner: user.id });

  if (error) return gameJson({ error: "query_failed" }, 500);
  return gameJson({ bookmarks: data ?? [] });
}

/** Toggle a bookmark. Ownership comes from the verified session, never the body. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { data, error } = await rpc<{ bookmarked: boolean }>("game_set_bookmark", {
    p_owner: user.id,
    p_question_id: parsed.data.questionId,
    p_bookmarked: parsed.data.bookmarked,
  });

  if (error) return gameJson({ error: "bookmark_failed" }, 500);
  return gameJson(data);
}
