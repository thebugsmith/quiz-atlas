"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";

const field =
  "border-border bg-surface focus-visible:outline-primary h-11 w-full rounded-[var(--radius-control)] border px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Export is a download; deletion is permanent and needs the address typed back.
 * Both act on this session's account only, checked again on the server.
 */
export function DataControls({ email }: { email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmEmail: typed }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setError(
        body?.error === "email_mismatch"
          ? "That address does not match this account."
          : "Could not delete the account. Try again.",
      );
      return;
    }

    await getBrowserClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <section className="border-border bg-surface mt-4 rounded-[var(--radius-card)] border p-4">
      <h3 className="text-sm font-semibold">Your data</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        Download everything this account owns, or erase it. Deleting removes your attempts, answers,
        bookmarks, achievements and public name; moderation audit entries stay, without your
        identity.
      </p>

      <a
        href="/api/account/export"
        className="border-border-strong bg-surface mt-3 inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] border px-3 text-sm font-medium"
      >
        <Download className="size-4" aria-hidden="true" />
        Download my data (JSON)
      </a>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-danger mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete my account
        </button>
      ) : (
        <div className="border-danger/40 mt-3 space-y-2 rounded-[var(--radius-control)] border p-3">
          <label htmlFor="delete-confirm" className="block text-sm font-medium">
            Type {email ?? "your email"} to confirm
          </label>
          <input
            id="delete-confirm"
            className={field}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-1"
            />
            I understand this cannot be undone.
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={remove}
              disabled={busy || !understood || typed.trim() === ""}
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button variant="quiet" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
          {error ? (
            <p className="text-danger text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
