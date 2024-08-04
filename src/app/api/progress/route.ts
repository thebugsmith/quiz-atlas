import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";
import type { ProgressPayload } from "@/features/progress/types";

/** Everything on the progress screen, derived on read from accepted answers. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { data, error } = await rpc<ProgressPayload>("game_progress", { p_owner: user.id });

  if (error || !data) return gameJson({ error: "progress_failed" }, 500);
  return gameJson(data);
}
