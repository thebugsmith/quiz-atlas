import { z } from "zod";
import { gameJson, requireUser, rpc, unauthenticated } from "@/features/quiz/api-helpers";
import { getServiceClient } from "@/server/supabase";

const schema = z.object({ confirmEmail: z.string().trim().min(3).max(320) });

/**
 * Permanent. The typed address must match the session's, so an accidental click on a
 * shared screen cannot erase the wrong account.
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthenticated();
  if (user.isAnonymous) return gameJson({ error: "no_account" }, 403);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return gameJson({ error: "invalid_request" }, 400);

  const { data: account } = await getServiceClient().auth.admin.getUserById(user.id);
  const email = account?.user?.email ?? null;

  if (!email || email.toLowerCase() !== parsed.data.confirmEmail.toLowerCase()) {
    return gameJson({ error: "email_mismatch" }, 400);
  }

  const { data, error } = await rpc<Record<string, unknown>>("game_delete_account", {
    p_owner: user.id,
  });

  if (error || !data) return gameJson({ error: "delete_failed" }, 500);
  return gameJson(data);
}
