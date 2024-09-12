import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

/** Everything this account owns, as one JSON document the player can keep. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { data, error } = await rpc<Record<string, unknown>>("game_export_account", {
    p_owner: user.id,
  });

  if (error || !data) return gameJson({ error: "export_failed" }, 500);

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="quiz-atlas-account-${user.id}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
