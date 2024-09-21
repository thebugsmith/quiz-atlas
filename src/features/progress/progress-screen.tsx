"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Target, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import type { ProgressPayload } from "@/features/progress/types";

const modeLabels: Record<string, string> = {
  classic: "Classic",
  time_rush: "Time Rush",
  practice: "Practice",
  daily: "Daily",
  survival: "Survival",
};

function percent(part: number, whole: number) {
  if (whole === 0) return "-";
  return `${Math.round((part / whole) * 100)}%`;
}

export function ProgressScreen() {
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/progress", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((body: ProgressPayload) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your progress.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-danger text-sm" role="alert">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Loading progress…
      </p>
    );
  }

  const { totals, streak } = data;
  const nothingYet = totals.completed_quizzes === 0 && totals.answered === 0;

  return (
    <div className="space-y-8">
      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Completed quizzes
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{totals.completed_quizzes}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Questions answered
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{totals.answered}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Accuracy
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">
              {totals.accuracy === null ? "-" : percent(totals.correct, totals.answered)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {totals.correct} correct of {totals.answered} answered
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <Flame className="size-3.5" aria-hidden="true" />
              Streak
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{streak.current}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Longest {streak.longest} · {streak.active_days} active day
              {streak.active_days === 1 ? "" : "s"}
            </p>
          </CardBody>
        </Card>
      </section>

      {nothingYet ? (
        <div className="border-border-strong bg-surface rounded-[var(--radius-card)] border border-dashed p-8 text-center">
          <p className="font-medium">Nothing here yet.</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
            Progress appears after your first finished quiz. Practice runs and revealed answers are
            left out of the numbers above, because they are not a fair measure.
          </p>
          <Link
            href="/play"
            className="bg-primary text-primary-foreground mt-4 inline-flex h-10 items-center rounded-[var(--radius-control)] px-4 text-sm font-medium"
          >
            Play your first quiz
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="topics-heading">
            <h2 id="topics-heading" className="mb-3 text-lg font-semibold tracking-tight">
              Topic accuracy
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                  <th scope="col" className="py-2 font-medium">
                    Topic
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Correct
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Answered
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    Accuracy
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topics.map((topic) => (
                  <tr key={topic.slug} className="border-border border-b last:border-0">
                    <th scope="row" className="py-2.5 text-left font-medium">
                      {topic.name}
                    </th>
                    <td className="py-2.5 text-right tabular-nums">{topic.correct}</td>
                    <td className="py-2.5 text-right tabular-nums">{topic.answered}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {percent(topic.correct, topic.answered)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted-foreground mt-2 text-xs">
              Sample sizes are shown so a 2-for-2 topic is not mistaken for a strong one.
            </p>
          </section>

          <section aria-labelledby="bests-heading">
            <h2
              id="bests-heading"
              className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <Trophy className="size-5" aria-hidden="true" />
              Personal bests
            </h2>
            {data.bests.length === 0 ? (
              <p className="text-muted-foreground text-sm">No complete runs yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.bests.map((best, index) => (
                  <li
                    key={`${best.mode}-${best.difficulty}-${best.length}-${index}`}
                    className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {modeLabels[best.mode] ?? best.mode} · {best.difficulty} · {best.length}
                        {best.mode === "time_rush" ? "s" : " questions"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {best.topics.length > 0 ? best.topics.join(", ") : "all topics"}
                      </p>
                    </div>
                    <Badge tone="primary">{best.best_score} pts</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-muted-foreground mt-2 text-xs">
              Each setup keeps its own best, so a five-question run never competes with a long one.
            </p>
          </section>
        </div>
      )}

      <section aria-labelledby="achievements-heading">
        <h2
          id="achievements-heading"
          className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <Target className="size-5" aria-hidden="true" />
          Achievements
        </h2>
        <ul className="grid gap-2 sm:grid-cols-3">
          {data.achievements.map((achievement) => (
            <li
              key={achievement.key}
              className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{achievement.name}</p>
                {achievement.unlocked ? <Badge tone="success">unlocked</Badge> : null}
              </div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {achievement.description}
              </p>
              <p className="text-muted-foreground mt-2 text-xs tabular-nums">
                {Math.min(achievement.progress, achievement.target)} / {achievement.target}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-lg font-semibold tracking-tight">
          Recent activity
        </h2>
        {data.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">Finished quizzes will show up here.</p>
        ) : (
          <ul className="space-y-2">
            {data.recent.map((attempt) => (
              <li
                key={attempt.id}
                className="border-border bg-surface flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {modeLabels[attempt.mode] ?? attempt.mode} · {attempt.score} pts
                    {attempt.status === "abandoned" ? " · ended early" : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {attempt.finished_at
                      ? new Date(attempt.finished_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "not finished"}
                    {" · "}
                    {attempt.correct_count}/{attempt.question_count} correct
                  </p>
                </div>
                <Link
                  href={`/results/${attempt.id}`}
                  className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                >
                  View result
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
