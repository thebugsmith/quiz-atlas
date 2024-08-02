import { cookies } from "next/headers";
import {
  gameJson,
  mapDatabaseError,
  requireUser,
  rpc,
  unauthenticated,
} from "@/features/quiz/api-helpers";

const COOKIE = "quiz_guest_id";

/**
 * Guest-to-existing-account transfer.
 *
 * Both identities must be proven before anything moves: the target account from the
 * verified session, and the guest from the httpOnly marker written while that guest
 * session was live. A browser with no marker transfers nothing.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return unauthenticated();
  if (user.isAnonymous) return gameJson({ error: "sign_in_required" }, 403);

  const store = await cookies();
  const guestId = store.get(COOKIE)?.value;
  if (!guestId) return gameJson({ error: "no_guest_session" }, 409);
  if (guestId === user.id) {
    store.delete(COOKIE);
    return gameJson({ error: "same_identity" }, 409);
  }

  const { data, error } = await rpc<{
    attempts_moved: number;
    bookmarks_moved: number;
    daily_attempts_dropped: number;
  }>("game_merge_guest", { p_guest: guestId, p_target: user.id });

  if (error || !data) {
    const mapped = error ? mapDatabaseError(error) : null;
    if (mapped) return mapped;
    return gameJson({ error: "merge_failed" }, 500);
  }

  store.delete(COOKIE);
  return gameJson({ merged: true, ...data });
}
