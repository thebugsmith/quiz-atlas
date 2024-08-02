import { cookies } from "next/headers";
import { gameJson, requireUser, unauthenticated } from "@/features/quiz/api-helpers";

const COOKIE = "quiz_guest_id";

/**
 * Records which guest identity this browser was using. The value is httpOnly so a
 * page script cannot point it at someone else's guest before a transfer.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return unauthenticated();
  if (!user.isAnonymous) return gameJson({ error: "not_a_guest" }, 409);

  const store = await cookies();
  store.set(COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return gameJson({ guestId: user.id });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(COOKIE);
  return gameJson({ cleared: true });
}
