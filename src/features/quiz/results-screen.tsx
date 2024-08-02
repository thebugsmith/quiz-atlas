"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Clock3, SkipForward, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type ReviewOption = { id: number; text: string };

type ReviewQuestion = {
  position: number;
  prompt: string;
  stem: string | null;
  statements: string[];
  options: ReviewOption[];
  selected_option_id: number | null;
  correct_option_id: number;
  is_correct: boolean;
  points: number;
  action: "answer" | "skip" | "reveal" | "timeout" | null;
  accepted_at: string | null;
  explanation: string | null;
  topic: { slug: string; name: string };
};

type AttemptSummary = {
  id: string;
  mode: string;
  status: "ready" | "active" | "completed" | "expired" | "abandoned";
  score: number;
  question_count: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
  answered_count: number;
  accuracy: number;
  config: { topics?: string[]; difficulty?: string; count?: number };
  rules_version: number;
  started_at: string | null;
  finished_at: string | null;
};

type ResultPayload = {
  attempt: AttemptSummary;
  reveal: "full" | "aggregate";
  questions: ReviewQuestion[];
};

const letter = (index: number) => String.fromCharCode(65 + index);

export function ResultsScreen({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/attempts/${attemptId}/result`, { cache: "no-store" })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401) {
          setError("Your session ended. Reload the page to start a guest session.");
          return;
        }
        if (!response.ok) {
          setError("This result is not available.");
          return;
        }
        setData(await response.json());
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server. Reload to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  async function replay() {
    if (!data || replaying) return;
    setReplaying(true);
    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topics: data.attempt.config.topics ?? ["history"],
          difficulty: data.attempt.config.difficulty ?? "mixed",
          count: data.attempt.config.count ?? data.attempt.question_count,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.attempt_id) {
        router.push(`/quiz/${body.attempt_id}`);
        return;
      }
      setError(
        body?.error === "insufficient_inventory"
          ? "Not enough questions remain for that setup. Try a smaller quiz."
          : "Could not start another quiz. Try the setup screen.",
      );
    } catch {
      setError("Could not reach the server. Try the setup screen.");
    } finally {
      setReplaying(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Result unavailable</h1>
        <p className="text-muted-foreground mt-2 text-sm">{error}</p>
        <Link
          href="/play"
          className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to setup
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-16" role="status">
        <p className="text-muted-foreground text-sm">Loading your result…</p>
      </div>
    );
  }

  const { attempt, reveal, questions } = data;
  const totalAnswered = attempt.correct_count + attempt.wrong_count;
  const topicRows = Object.values(
    questions.reduce<Record<string, { name: string; correct: number; total: number }>>(
      (acc, question) => {
        const key = question.topic.slug;
        acc[key] ??= { name: question.topic.name, correct: 0, total: 0 };
        acc[key].total += 1;
        if (question.is_correct) acc[key].correct += 1;
        return acc;
      },
      {},
    ),
  );

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10">
      <header className="mb-6">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {attempt.mode.replace("_", " ")} · rules v{attempt.rules_version}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {attempt.status === "expired"
            ? "This quiz expired"
            : attempt.status === "abandoned"
              ? "Quiz ended early"
              : attempt.mode === "time_rush"
                ? "Time's up"
                : "Quiz complete"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {attempt.mode === "time_rush"
            ? `${attempt.answered_count} answered · ${attempt.correct_count} correct · ${attempt.wrong_count} wrong`
            : `${attempt.correct_count} of ${attempt.question_count} correct · ${
                attempt.status === "abandoned" ? "ended before the last question" : "full attempt"
              }`}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Score", value: attempt.score },
          { label: "Correct", value: attempt.correct_count },
          { label: "Wrong", value: attempt.wrong_count },
          { label: "Skipped", value: attempt.skipped_count },
        ].map((item) => (
          <div
            key={item.label}
            className="border-border bg-surface rounded-[var(--radius-card)] border p-4"
          >
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd className="mt-1 text-xl font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Accuracy on answered questions</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {attempt.accuracy}% — {attempt.correct_count} correct of {totalAnswered} answered.
              {attempt.skipped_count > 0
                ? ` ${attempt.skipped_count} skipped (not counted as wrong).`
                : ""}
            </p>
          </div>
          <Badge tone="primary">
            {attempt.correct_count} / {attempt.question_count} questions
          </Badge>
        </div>

        {topicRows.length > 1 ? (
          <ul className="mt-4 space-y-2">
            {topicRows.map((row) => (
              <li key={row.name} className="text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span>{row.name}</span>
                  <span className="text-muted-foreground">
                    {row.correct}/{row.total}
                  </span>
                </div>
                <div className="bg-surface-muted mt-1 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${Math.round((row.correct / row.total) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={replay} disabled={replaying}>
          {replaying ? "Starting…" : "Play again"}
        </Button>
        <Link
          href={`/play?topics=${(attempt.config.topics ?? []).join(",")}&difficulty=${
            attempt.config.difficulty ?? "mixed"
          }&count=${attempt.config.count ?? attempt.question_count}`}
          className="border-border-strong bg-surface inline-flex h-11 items-center rounded-[var(--radius-control)] border px-4 text-[15px] font-medium"
        >
          Change setup
        </Link>
        <Link
          href="/"
          className="text-muted-foreground inline-flex h-11 items-center px-2 text-[15px] font-medium hover:underline"
        >
          Home
        </Link>
      </div>

      {reveal === "full" && questions.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Answer review</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            The questions exactly as you saw them, with the answer that was accepted.
          </p>

          <ol className="mt-4 space-y-3">
            {questions.map((question) => {
              const skipped = question.action === "skip";
              const unanswered = question.action === null;
              return (
                <li key={question.position}>
                  <details className="border-border bg-surface group rounded-[var(--radius-card)] border">
                    <summary className="flex cursor-pointer items-start gap-3 p-4">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          question.is_correct
                            ? "bg-success-soft text-success"
                            : skipped || unanswered
                              ? "bg-surface-muted text-muted-foreground"
                              : "bg-danger-soft text-danger",
                        )}
                        aria-hidden="true"
                      >
                        {question.is_correct ? (
                          <Check className="size-3.5" />
                        ) : skipped || unanswered ? (
                          <SkipForward className="size-3.5" />
                        ) : (
                          <X className="size-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-muted-foreground block text-xs">
                          Question {question.position} · {question.topic.name}
                          {unanswered
                            ? " · not answered"
                            : skipped
                              ? " · skipped"
                              : question.is_correct
                                ? " · correct"
                                : " · incorrect"}
                        </span>
                        <span className="mt-0.5 block text-[15px] leading-snug">
                          {question.prompt}
                        </span>
                      </span>
                    </summary>

                    <div className="border-border border-t p-4 pt-3">
                      {question.stem ? (
                        <p className="text-muted-foreground mb-2 text-sm">{question.stem}</p>
                      ) : null}
                      {question.statements.length > 0 ? (
                        <ol className="bg-surface-muted mb-3 space-y-1 rounded-[var(--radius-control)] p-3 text-sm">
                          {question.statements.map((statement, index) => (
                            <li key={index} className="flex gap-2">
                              <span className="text-muted-foreground">{index + 1}.</span>
                              <span>{statement}</span>
                            </li>
                          ))}
                        </ol>
                      ) : null}

                      <ul className="space-y-1.5">
                        {question.options.map((option, index) => {
                          const isCorrect = option.id === question.correct_option_id;
                          const isChosen = option.id === question.selected_option_id;
                          return (
                            <li
                              key={option.id}
                              className={cn(
                                "flex items-start gap-2 rounded-md px-2 py-1 text-sm",
                                isCorrect
                                  ? "bg-success-soft text-success"
                                  : isChosen
                                    ? "bg-danger-soft text-danger"
                                    : "text-muted-foreground",
                              )}
                            >
                              <span className="font-medium">{letter(index)}.</span>
                              <span className="min-w-0 flex-1 break-words">{option.text}</span>
                              <span className="text-xs whitespace-nowrap">
                                {isCorrect ? "correct" : isChosen ? "your answer" : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>

                      {question.explanation ? (
                        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                          {question.explanation}
                        </p>
                      ) : null}

                      {question.accepted_at ? (
                        <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                          <Clock3 className="size-3" aria-hidden="true" />
                          Answered {new Date(question.accepted_at).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <p className="border-border bg-surface-muted text-muted-foreground mt-10 rounded-[var(--radius-control)] border p-4 text-sm">
          Detailed answers unlock once this attempt is finished.
        </p>
      )}
    </div>
  );
}
