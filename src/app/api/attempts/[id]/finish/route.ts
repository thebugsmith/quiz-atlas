import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

/** Finalizes once; the server decides whether the attempt completed or was abandoned. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { id } = await params;
  const { data, error } = await rpc<Record<string, unknown>>("game_finish", {
    p_attempt_id: id,
    p_owner: user.id,
  });

  if (error) {
    return mapDatabaseError(error) ?? gameJson({ error: "finish_failed" }, 500);
  }

  return gameJson(data);
}
