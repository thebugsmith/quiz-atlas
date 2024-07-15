"use client";

import { UserRound } from "lucide-react";
import { useGuestSession } from "./guest-session";

/**
 * States the guest situation honestly: an identity exists so progress can be
 * stored, and it lives in this browser only.
 */
export function GuestNotice() {
  const session = useGuestSession();

  if (session.status === "loading") {
    return (
      <p className="text-muted-foreground mb-4 text-sm" role="status">
        Starting your session…
      </p>
    );
  }

  if (session.status === "error") {
    return (
      <p
        className="border-danger/40 bg-danger-soft text-danger mb-4 rounded-[var(--radius-control)] border px-3 py-2 text-sm"
        role="alert"
      >
        Could not start a session: {session.message}. Playing without saved progress.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground mb-4 inline-flex items-center gap-2 text-sm">
      <UserRound className="size-4" aria-hidden="true" />
      {session.isAnonymous
        ? "Playing as a guest. Your results stay in this browser — clearing site data or signing out loses them."
        : "Signed in."}
    </p>
  );
}
