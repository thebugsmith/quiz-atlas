import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Built from stored attempts; no request field can influence a score. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? "";
  if (!DATE.test(date)) return gameJson({ error: "invalid_request" }, 400);

  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const limit = 25;

  const { data, error } = await rpc<Record<string, unknown>>("game_daily_leaderboard", {
    p_viewer: user.id,
    p_date: date,
    p_limit: limit,
    p_offset: (page - 1) * limit,
  });

  if (error || !data) return gameJson({ error: "leaderboard_failed" }, 500);
  return gameJson({ ...data, page });
}
