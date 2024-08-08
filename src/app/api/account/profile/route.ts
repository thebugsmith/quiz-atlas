import { z } from "zod";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthenticated();

  const { data, error } = await rpc<Record<string, unknown>>("game_public_profile", {
    p_owner: user.id,
  });
  if (error) return gameJson({ error: "profile_failed" }, 500);
  return gameJson({ profile: data });
}

const schema = z.object({
  displayName: z.string().trim().min(2).max(40),
  leaderboardPublic: z.boolean(),
});

/** Display name and leaderboard visibility belong to the owner. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();
  if (user.isAnonymous) return gameJson({ error: "sign_in_required" }, 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { data, error } = await rpc<Record<string, unknown>>("game_update_profile", {
    p_owner: user.id,
    p_display_name: parsed.data.displayName,
    p_leaderboard_public: parsed.data.leaderboardPublic,
  });

  if (error || !data) return gameJson({ error: "profile_failed" }, 500);
  return gameJson({ profile: data });
}
