"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Bookmark = {
  question_id: string;
  prompt: string;
  topic_slug: string;
  topic_name: string;
  created_at: string;
};

export function BookmarksList() {
  const [items, setItems] = useState<Bookmark[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bookmarks", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((body) => {
        if (!cancelled) setItems(body.bookmarks ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your bookmarks.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(questionId: string) {
    setBusy(questionId);
    try {
      const response = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, bookmarked: false }),
      });
      if (response.ok)
        setItems((current) => (current ?? []).filter((item) => item.question_id !== questionId));
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <p className="text-danger text-sm" role="alert">
        {error}
      </p>
    );
  }

  if (items === null) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Loading bookmarks…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="border-border-strong bg-surface rounded-[var(--radius-card)] border border-dashed p-8 text-center">
        <p className="font-medium">No bookmarks yet.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Tap the bookmark button while practising to save a question here.
        </p>
        <div className="mt-4">
          <Link
            href="/play"
            className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-[var(--radius-control)] px-4 text-sm font-medium"
          >
            Find something to practise
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {items.length} saved question{items.length === 1 ? "" : "s"}
        </p>
        <Link
          href="/play?mode=practice&source=bookmarks&count=50"
          className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-[var(--radius-control)] px-4 text-sm font-medium"
        >
          Practise these
        </Link>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.question_id}
            className="border-border bg-surface flex items-start justify-between gap-3 rounded-[var(--radius-card)] border p-4"
          >
            <div className="min-w-0">
              <Badge>{item.topic_name}</Badge>
              <p className="mt-1.5 text-[15px] leading-snug break-words">{item.prompt}</p>
            </div>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => remove(item.question_id)}
              disabled={busy === item.question_id}
              aria-label={`Remove bookmark for: ${item.prompt}`}
            >
              <BookmarkX className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
