"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Favorites are a small preference, not progress: the click is optimistic, and a failed
 * request rolls the star back so the button never claims something was saved.
 */
export function FavoriteButton({ paper, initial }: { paper: string; initial: boolean }) {
  const [favorite, setFavorite] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    const next = !favorite;
    setFavorite(next);
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/exam-favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper, favorite: next }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { favorite?: boolean };
      if (data.favorite !== next) throw new Error("mismatch");
    } catch {
      setFavorite(!next);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={favorite}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors",
        favorite
          ? "bg-primary-soft text-primary border-transparent"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <Star className={cn("size-4", favorite && "fill-current")} aria-hidden="true" />
      {favorite ? "Saved" : "Save paper"}
      {failed ? <span className="text-warning text-xs">not saved</span> : null}
    </button>
  );
}
