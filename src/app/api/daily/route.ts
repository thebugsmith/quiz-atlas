import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/** Today's window, the player's slot and whether they may still start. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { data, error } = await rpc<Record<string, unknown>>("game_daily_status", {
    p_owner: user.id,
  });

  if (error || !data) return gameJson({ error: "daily_failed" }, 500);
  return gameJson(data);
}
