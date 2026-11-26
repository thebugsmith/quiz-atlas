"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, LogOut, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";
import { ProfileForm } from "@/features/account/profile-form";
import { DataControls } from "@/features/account/data-controls";

type Identity = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
} | null;

/**
 * Google is the only way to become permanent; guests keep playing without an account.
 *
 * A guest signs in with the same provider call everybody else uses. The callback moves the
 * guest's attempts and bookmarks onto whichever account Google returns, so one click both
 * creates an account and opens an existing one — linking the provider to the guest is not
 * offered, because Supabase refuses that for a Google account that already has a user and
 * the refusal used to come back as "sign in instead", a second click for no reason.
 */
export function AccountShell() {
  const router = useRouter();
  const params = useSearchParams();
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    params.get("merged") === "1"
      ? "Signed in. The work you did as a guest now belongs to this account."
      : null,
  );
  const [error, setError] = useState<string | null>(() => {
    switch (params.get("error")) {
      case "expired_link":
        return "That sign-in link expired. Try again.";
      case "invalid_link":
        return "The sign-in link was malformed. Try again.";
      case "auth_failed": {
        const reason = params.get("reason");
        return reason
          ? `Google did not complete the sign-in (${reason}). Try again.`
          : "Google did not complete the sign-in. Try again.";
      }
      default:
        return null;
    }
  });

  const readIdentity = useCallback(async (): Promise<Identity> => {
    const { data, error: readError } = await getBrowserClient().auth.getUser();
    if (readError || !data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      isAnonymous: Boolean(data.user.is_anonymous),
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readIdentity().then((next) => {
      if (!cancelled) setIdentity(next);
    });
    return () => {
      cancelled = true;
    };
  }, [readIdentity]);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = getBrowserClient();
    const origin = window.location.origin;

    // One button for both outcomes: Google creates the account or opens the one it already
    // has, and /auth/callback moves a guest's work onto whatever comes back.
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/account")}` },
    });
    setBusy(false);
    if (authError) setError(authError.message);
  }

  async function handleSignOut() {
    setBusy(true);
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    setBusy(false);
    setIdentity(null);
    setMessage("Signed out. You are playing as a new guest.");
    router.refresh();
  }

  if (identity === undefined) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Checking your session…
      </p>
    );
  }

  if (identity && !identity.isAnonymous) {
    return (
      <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="text-success size-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-tight">Permanent account</h2>
          <Badge tone="success">saved</Badge>
        </div>
        <p className="mt-2 text-[15px]">{identity.email ?? "Signed in with Google"}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Your results, bookmarks and daily runs follow this account on every device you sign in to.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => router.push("/play")}>
            Play a quiz
          </Button>
          <Button variant="quiet" onClick={handleSignOut} disabled={busy}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
        {message ? (
          <p className="text-success mt-4 flex items-start gap-2 text-sm" role="status">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
          </p>
        ) : null}
        <ProfileForm />
        <DataControls email={identity.email} />
      </div>
    );
  }

  return (
    <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="text-primary size-5" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight">Keep your progress</h2>
        {identity?.isAnonymous ? <Badge>guest</Badge> : null}
      </div>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        {identity?.isAnonymous
          ? "You are playing as a guest, so your results live in this browser. Sign in with Google to keep them here and on every other device."
          : "Sign in with Google to keep your results, bookmarks and daily runs across devices."}
      </p>

      <Button onClick={handleGoogle} disabled={busy} className="mt-5 w-full sm:w-auto">
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>

      <p className="text-muted-foreground mt-3 text-xs">
        {identity?.isAnonymous
          ? "Signs you in if you already have an account, or makes one. Anything you have played as a guest moves onto it."
          : "No password to remember and no confirmation email to wait for."}
      </p>

      {message ? (
        <p className="text-success mt-4 flex items-start gap-2 text-sm" role="status">
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : null}
      {error ? (
        <p className="text-danger mt-4 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
