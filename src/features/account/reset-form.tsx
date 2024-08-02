"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";

const fieldClass =
  "border-border bg-surface focus-visible:outline-primary h-11 w-full rounded-[var(--radius-control)] border px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Two entry points share this form: arriving from a recovery link (an active session
 * is present, so only the new password is needed) and asking for the link itself.
 */
export function ResetForm() {
  const router = useRouter();
  const [recovering, setRecovering] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setRecovering(Boolean(data.user));
    });
  }, []);

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
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

  async function setNewPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage("Password updated. You can sign in with it now.");
    router.push("/account");
  }

  if (recovering === null) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Checking your link…
      </p>
    );
  }

  return (
    <form onSubmit={recovering ? setNewPassword : requestLink} className="max-w-md space-y-3">
      {recovering ? (
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldClass}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="reset-email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
          />
        </div>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? "Working…" : recovering ? "Set new password" : "Send reset link"}
      </Button>

      {message ? (
        <p className="text-success text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
