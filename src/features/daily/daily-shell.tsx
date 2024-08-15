"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DailyStatus = {
  challenge_id: string;
  date: string;
  question_count: number;
  closes_at: string;
  closed: boolean;
  ranked: boolean;
  can_start_ranked: boolean;
  attempt: {
    attempt_id: string;
    status: "ready" | "active" | "completed" | "expired" | "abandoned";
    score: number;
    correct_count: number;
    wrong_count: number;
    question_count: number;
    finished_at: string | null;
  } | null;
};

export function DailyShell() {
  const router = useRouter();
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(attempt = 0): Promise<void> {
      const response = await fetch("/api/daily", { cache: "no-store" });
      if (cancelled) return;

      // Opening /daily directly can beat the guest session into existence; one retry
      // covers that without hiding a real failure.
      if (response.status === 401 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return load(1);
      }
      if (!response.ok) {
        setError("Could not load today\u2019s challenge.");
        return;
      }
      setStatus(await response.json());
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/daily/attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok || !body?.attempt_id) {
      setError(
        body?.error === "already_played"
          ? "This account already used today's ranked attempt."
          : body?.error === "insufficient_inventory"
            ? "Today&rsquo;s set could not be built — there are not enough live questions."
            : "Could not start today's challenge.",
      );
      return;
    }

    router.push(`/quiz/${body.attempt_id}`);
  }

  if (error) {
    return (
      <p className="text-danger text-sm" role="alert">
        {error}
      </p>
    );
  }

  if (!status) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Loading today&rsquo;s challenge…
      </p>
    );
  }

  const closesLocal = new Date(status.closes_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const attempt = status.attempt;

  return (
    <div className="border-border bg-surface rounded-[var(--radius-card)] border p-6">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="text-primary size-5" aria-hidden="true" />
        <h2 className="text-lg font-semibold tracking-tight">
          {new Date(`${status.date}T00:00:00Z`).toLocaleDateString(undefined, {
            dateStyle: "long",
            timeZone: "UTC",
          })}
        </h2>
        <Badge tone={status.closed ? "neutral" : "success"}>
          {status.closed ? "closed" : "open"}
        </Badge>
      </div>

      <p className="text-muted-foreground mt-2 text-[15px]">
        {status.question_count} questions, the same set and order for everyone. The window closes at{" "}
        {closesLocal} your time (midnight UTC).
      </p>

      {!attempt ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            One ranked attempt per account. Guests can play, but a guest attempt never becomes
            ranked.
          </p>
          <Button className="mt-4" onClick={start} disabled={busy}>
            {busy ? "Starting…" : "Start today's challenge"}
          </Button>
        </>
      ) : attempt.status === "active" || attempt.status === "ready" ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            You have started today&rsquo;s challenge. Finish it before the window closes.
          </p>
          <Link
            href={`/quiz/${attempt.attempt_id}`}
            className="bg-primary text-primary-foreground mt-4 inline-flex h-10 items-center rounded-[var(--radius-control)] px-4 text-sm font-medium"
          >
            Resume
          </Link>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Trophy className="text-primary size-5" aria-hidden="true" />
            <p className="text-2xl font-semibold tracking-tight">{attempt.score} pts</p>
            <Badge tone={attempt.status === "completed" ? "success" : "neutral"}>
              {attempt.status === "completed" ? "finished" : "ended early"}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {attempt.correct_count} correct · {attempt.wrong_count} wrong of{" "}
            {attempt.question_count}.
          </p>
          <p className="text-muted-foreground mt-3 max-w-prose text-sm">
            {status.closed
              ? "The window has closed, so per-question review is available."
              : "Per-question review unlocks when the window closes."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/results/${attempt.attempt_id}`}
              className="border-border-strong bg-surface inline-flex h-10 items-center rounded-[var(--radius-control)] border px-4 text-sm font-medium"
            >
              {status.closed ? "Review answers" : "See result"}
            </Link>
            {status.closed ? (
              <Button variant="quiet" onClick={start} disabled={busy}>
                {busy ? "Starting…" : "Play again (unranked)"}
              </Button>
            ) : null}
          </div>
          {!status.can_start_ranked ? (
            <p className="text-muted-foreground mt-3 text-xs">
              Your ranked slot for today is used. Tomorrow&rsquo;s set opens at midnight UTC.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
