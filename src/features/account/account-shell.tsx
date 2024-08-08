"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, LogOut, Mail, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";
import { ProfileForm } from "@/features/account/profile-form";
import { cn } from "@/lib/cn";

type Identity = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  confirmed: boolean;
} | null;
type Panel = "create" | "signin" | "reset";

const fieldClass =
  "border-border bg-surface focus-visible:outline-primary h-11 w-full rounded-[var(--radius-control)] border px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2";

export function AccountShell() {
  const router = useRouter();
  const params = useSearchParams();
  const [identity, setIdentity] = useState<Identity | undefined>(undefined);
  const [panel, setPanel] = useState<Panel>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Link outcomes are known at first render, so they seed the notice instead of
  // being pushed into state from an effect.
  const [message, setMessage] = useState<string | null>(
    params.get("confirmed") === "1"
      ? "Email confirmed. Your quizzes now belong to this account."
      : null,
  );
  const [error, setError] = useState<string | null>(
    params.get("error") === "expired_link"
      ? "That link has expired. Request a new one below."
      : params.get("error") === "invalid_link"
        ? "That link was not valid. Request a new one below."
        : null,
  );

  const readIdentity = useCallback(async (): Promise<Identity> => {
    const { data } = await getBrowserClient().auth.getUser();
    const user = data.user;
    return user
      ? {
          id: user.id,
          email: user.email ?? null,
          isAnonymous: Boolean(user.is_anonymous),
          confirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
        }
      : null;
  }, []);

  const load = useCallback(async () => {
    const next = await readIdentity();
    setIdentity(next);
    if (next?.isAnonymous) {
      // Remember the guest identity server-side, so signing in later can carry its work over.
      void fetch("/api/account/guest-marker", { method: "POST" });
    }
  }, [readIdentity]);

  useEffect(() => {
    let cancelled = false;
    void readIdentity().then((next) => {
      if (cancelled) return;
      setIdentity(next);
      if (next?.isAnonymous) void fetch("/api/account/guest-marker", { method: "POST" });
    });
    return () => {
      cancelled = true;
    };
  }, [readIdentity]);

  async function upgradeGuest() {
    // Only asked when a guest marker exists; a no-op otherwise.
    const response = await fetch("/api/account/upgrade", { method: "POST" });
    if (!response.ok) return null;
    return (await response.json()) as {
      attempts_moved: number;
      bookmarks_moved: number;
      daily_attempts_dropped: number;
    };
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = getBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;

    // A guest is upgraded in place: the same identity becomes permanent, so nothing has
    // to be copied and no ownership can be confused. A signed-out visitor gets a plain
    // new account instead.
    const { error: updateError } = identity?.isAnonymous
      ? await supabase.auth.updateUser({ email, password }, { emailRedirectTo: redirectTo })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });

    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage(
      `Check ${email} for a confirmation link. Until you confirm, this account only works here.`,
    );
    await load();
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = getBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setBusy(false);
      setError(signInError.message);
      return;
    }

    const merged = await upgradeGuest();
    setBusy(false);
    await load();
    if (merged && merged.attempts_moved + merged.bookmarks_moved > 0) {
      setMessage(
        `Signed in. Moved ${merged.attempts_moved} quiz attempt${merged.attempts_moved === 1 ? "" : "s"} and ${merged.bookmarks_moved} bookmark${merged.bookmarks_moved === 1 ? "" : "s"} from your guest session.`,
      );
    } else {
      setMessage("Signed in.");
    }
    router.refresh();
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = getBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/reset`,
    });
    setBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMessage(`If ${email} has an account, a reset link is on its way.`);
  }

  async function handleSignOut() {
    setBusy(true);
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    await fetch("/api/account/guest-marker", { method: "DELETE" });
    setBusy(false);
    setIdentity(null);
    setMessage("Signed out.");
    router.refresh();
  }

  if (identity === undefined) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Checking your session…
      </p>
    );
  }

  if (identity && !identity.isAnonymous && !identity.confirmed) {
    return (
      <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
        <h2 className="text-lg font-semibold tracking-tight">Confirm your email</h2>
        <p className="text-muted-foreground mt-2 max-w-prose text-sm">
          We sent a confirmation link to {identity.email}. Until you open it, this account only
          works in this browser.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const supabase = getBrowserClient();
            await supabase.auth.resend({
              type: "signup",
              email: identity.email ?? "",
              options: { emailRedirectTo: `${window.location.origin}/account?confirmed=1` },
            });
            setBusy(false);
            setMessage("Sent again — check your inbox.");
          }}
        >
          Resend confirmation
        </Button>
        {message ? (
          <p className="text-success mt-3 text-sm" role="status">
            {message}
          </p>
        ) : null}
      </div>
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
        <p className="mt-2 text-[15px]">{identity.email}</p>
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
      </div>
    );
  }

  return (
    <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="text-primary size-5" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight">Keep your progress</h2>
        {identity?.isAnonymous ? <Badge>guest</Badge> : null}
      </div>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        {identity?.isAnonymous
          ? "You are playing as a guest, so everything lives in this browser. Add an email and password to keep it."
          : "Create an account to keep your results and bookmarks across devices."}
      </p>

      <div role="tablist" aria-label="Account actions" className="mt-5 flex flex-wrap gap-2">
        {(
          [
            { value: "create", label: "Create account" },
            { value: "signin", label: "Sign in" },
            { value: "reset", label: "Forgot password" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            role="tab"
            type="button"
            aria-selected={panel === tab.value}
            onClick={() => {
              setPanel(tab.value);
              setError(null);
            }}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              panel === tab.value
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={
          panel === "create" ? handleCreate : panel === "signin" ? handleSignIn : handleReset
        }
        className="mt-4 space-y-3"
      >
        <div>
          <label htmlFor="account-email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
          />
        </div>

        {panel !== "reset" ? (
          <div>
            <label htmlFor="account-password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="account-password"
              type="password"
              autoComplete={panel === "create" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
            {panel === "create" ? (
              <p className="text-muted-foreground mt-1 text-xs">At least 8 characters.</p>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy
            ? "Working…"
            : panel === "create"
              ? "Create account"
              : panel === "signin"
                ? "Sign in"
                : "Send reset link"}
        </Button>
      </form>

      {panel === "signin" ? (
        <p className="text-muted-foreground mt-3 text-xs">
          Signing in here also brings across anything you played as a guest on this browser.
        </p>
      ) : null}

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
