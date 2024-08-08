"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Profile = { display_name: string; leaderboard_public: boolean } | null;

const field =
  "border-border bg-surface focus-visible:outline-primary h-11 w-full rounded-[var(--radius-control)] border px-3 text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2";

/** Display name and leaderboard visibility — both belong only to this account. */
export function ProfileForm() {
  const [profile, setProfile] = useState<Profile>(null);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/profile", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { profile: null }))
      .then((body: { profile: Profile }) => {
        if (cancelled) return;
        setProfile(body.profile);
        if (body.profile) {
          setName(body.profile.display_name);
          setIsPublic(body.profile.leaderboard_public);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: name, leaderboardPublic: isPublic }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setError(
        body?.error === "invalid_request"
          ? "Use a display name of 2 to 40 characters."
          : "Could not save that.",
      );
      return;
    }

    setProfile(body.profile);
    setNotice("Saved.");
  }

  return (
    <form
      onSubmit={save}
      className="border-border bg-surface mt-4 rounded-[var(--radius-card)] border p-4"
    >
      <h3 className="text-sm font-semibold">Leaderboard identity</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-name" className="mb-1 block text-sm font-medium">
            Display name
          </label>
          <input
            id="profile-name"
            className={field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={profile?.display_name ?? "Your name on the board"}
            maxLength={40}
          />
        </div>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          Show my name on leaderboards
        </label>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        With this off, your rows appear as “Hidden player” to everyone but you. Your rank and score
        still count.
      </p>
      <Button type="submit" variant="secondary" className="mt-3" disabled={busy}>
        {busy ? "Saving…" : "Save identity"}
      </Button>
      {notice ? (
        <p className="text-success mt-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-danger mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
