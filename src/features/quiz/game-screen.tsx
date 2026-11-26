"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bookmark, Check, Compass, Eye, LogOut, X } from "lucide-react";
import { ReportQuestion } from "@/features/quiz/report-question";
import { playCorrect, playWrong } from "@/components/a11y/sound";
import {
  getSoundServerSnapshot,
  getSoundSnapshot,
  setSoundEnabled,
  subscribeSound,
} from "@/components/a11y/preferences";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { MatchLists, type MatchBlock } from "@/components/ui/match-lists";

type Option = { id: number; text: string };

type Question = {
  position: number | null;
  total: number;
  question_id?: string;
  question_version_id?: string;
  bookmarked?: boolean;
  type: "mcq" | "comprehension";
  stem: string | null;
  statements: string[];
  match?: MatchBlock | null;
  prompt: string;
  options: Option[];
  finished?: boolean;
};

type Attempt = {
  id: string;
  mode: "classic" | "time_rush" | "practice" | "daily" | "survival";
  lives?: number | null;
  status: "ready" | "active" | "completed" | "expired" | "abandoned";
  expires_at?: string | null;
  score: number;
  question_count: number;
  correct_count: number;
  wrong_count: number;
  skipped_count: number;
};

type Feedback = {
  action: "answer" | "skip" | "reveal";
  is_correct: boolean;
  points: number;
  correct_option_id: number;
  explanation: string | null;
  score: number;
};

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "question"; question: Question; attempt: Attempt }
  | { name: "feedback"; question: Question; feedback: Feedback; attempt: Attempt }
  // The stored attempt says this question was already answered (another tab, or the
  // response to our submission was lost). We do not invent an outcome; we offer Next.
  | { name: "stale"; question: Question; attempt: Attempt }
  | { name: "done"; attempt: Attempt }
  | { name: "quitting" };

/**
 * Moves on shortly after feedback appears, so a player can read the explanation
 * without hunting for a button. Mounted once per feedback, so the timer runs once.
 */
function AutoAdvance({ delayMs, onAdvance }: { delayMs: number; onAdvance: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onAdvance, delayMs);
    return () => clearTimeout(timer);
    // Intentionally mount-once: `onAdvance` belongs to the feedback being shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-primary/20 mt-3 h-1 w-full overflow-hidden rounded-full" aria-hidden="true">
      <div
        className="bg-primary h-full w-full origin-left"
        style={{ animation: `countdown ${delayMs}ms linear forwards` }}
      />
    </div>
  );
}

export function GameScreen({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  // The next question arrives with the answer, so advancing is instant.
  const prefetched = useRef<{
    attempt: Attempt | null;
    question: Question | null;
  } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  // Time Rush: the deadline comes from the server, and only the server decides
  // whether an answer was in time. The browser clock is used for display only.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const clockOffset = useRef(0);
  // Screen readers get thresholds, not a per-second tick.
  const lastThreshold = useRef<number | null>(null);
  const soundOn = useSyncExternalStore(subscribeSound, getSoundSnapshot, getSoundServerSnapshot);
  const promptRef = useRef<HTMLHeadingElement | null>(null);
  const liveRef = useRef<HTMLParagraphElement | null>(null);
  const submitRef = useRef<(action: "answer" | "skip" | "reveal", optionId?: number) => void>(
    () => {},
  );
  // Idempotency key per question. It is derived rather than random, so a retry after
  // a reload still names the same submission and the server can replay the outcome
  // instead of scoring the answer twice.
  const keyFor = (position: number) => `${attemptId}-p${position}`;

  const loadState = useCallback(async () => {
    const response = await fetch(`/api/attempts/${attemptId}`, { cache: "no-store" });

    if (response.status === 401) {
      setPhase({ name: "error", message: "Your session ended. Reload to start a guest session." });
      return;
    }
    if (response.status === 404) {
      setPhase({ name: "error", message: "This quiz does not exist, or belongs to someone else." });
      return;
    }
    const body = await response.json();
    const attempt: Attempt = body.attempt;

    // Server clock offset, so a wrong or changed local clock cannot buy time.
    if (body.server_now) {
      clockOffset.current = new Date(body.server_now).getTime() - Date.now();
    }

    if (attempt.status === "ready") {
      const started = await fetch(`/api/attempts/${attemptId}/start`, { method: "POST" });
      const startedBody = await started.json();
      if (!started.ok) {
        setPhase({ name: "error", message: "Could not start this quiz." });
        return;
      }
      const active: Attempt = {
        ...attempt,
        status: "active",
        score: 0,
        expires_at: startedBody.attempt?.expires_at ?? null,
      };
      if (startedBody.attempt?.server_now) {
        clockOffset.current = new Date(startedBody.attempt.server_now).getTime() - Date.now();
      }
      if (active.expires_at) {
        setRemainingMs(new Date(active.expires_at).getTime() - (Date.now() + clockOffset.current));
      }
      setPhase({ name: "question", question: startedBody.question, attempt: active });
      return;
    }

    if (attempt.status === "active" && body.question && body.question.position) {
      if (attempt.expires_at) {
        setRemainingMs(new Date(attempt.expires_at).getTime() - (Date.now() + clockOffset.current));
      }
      if (body.question.answered) {
        setPhase({ name: "stale", question: body.question, attempt });
        return;
      }
      setPhase({ name: "question", question: body.question, attempt });
      return;
    }

    // Finished, expired or abandoned: the result screen owns that story now.
    router.replace(`/results/${attemptId}`);
  }, [attemptId, router]);

  useEffect(() => {
    if (remainingMs === null) return;
    if (remainingMs <= 0) return;

    const startedAt = Date.now();
    const initial = remainingMs;
    const timer = setInterval(() => {
      // Count down from the server deadline using elapsed monotonic time, so a
      // system clock jump does not change what the player sees.
      const elapsed = Date.now() - startedAt;
      setRemainingMs(Math.max(0, initial - elapsed));
    }, 250);

    return () => clearInterval(timer);
  }, [remainingMs === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (remainingMs !== 0) return;
    if (phase.name !== "question" && phase.name !== "feedback" && phase.name !== "stale") return;
    // Time is up: finalize what exists and show the result.
    void fetch(`/api/attempts/${attemptId}/finish`, { method: "POST" }).finally(() => {
      router.replace(`/results/${attemptId}`);
    });
  }, [remainingMs, phase.name, attemptId, router]);

  useEffect(() => {
    let active = true;

    async function initialise() {
      try {
        await loadState();
      } catch {
        if (active) {
          setPhase({ name: "error", message: "Could not reach the server. Reload to try again." });
        }
      }
    }

    void initialise();
    return () => {
      active = false;
    };
  }, [loadState]);

  useEffect(() => {
    // Two tabs, or a tab left in the background: on return, trust the stored attempt
    // rather than whatever this tab last drew.
    function reconcile() {
      if (document.visibilityState !== "visible") return;
      if (pending) return;
      if (phase.name !== "question" && phase.name !== "stale") return;
      void loadState().catch(() => undefined);
    }

    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [loadState, pending, phase.name]);

  async function submit(action: "answer" | "skip" | "reveal", optionId?: number) {
    if (phase.name !== "question" || pending) return;
    const chosen = optionId ?? selected;
    if (action === "answer" && chosen === null) return;

    setPending(true);
    setNotice(null);
    const position = phase.question.position as number;

    const sendAnswer = () =>
      fetch(`/api/attempts/${attemptId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          position,
          action,
          optionId: action === "answer" ? chosen : null,
          // Derived from the attempt and position, so a retry after a lost response is
          // recognised as the same submission and replayed, not scored twice.
          idempotencyKey: keyFor(position),
        }),
      });

    try {
      let response: Response;
      try {
        response = await sendAnswer();
      } catch {
        // One automatic retry: the usual cause is a dropped connection, not a bad request.
        response = await sendAnswer();
      }
      const body = await response.json().catch(() => null);

      if (!response.ok || !body) {
        if (body?.error === "deadline_passed") {
          router.replace(`/results/${attemptId}`);
          return;
        }
        setNotice(
          body?.error === "already_answered"
            ? "This question was already answered in another tab."
            : "Could not submit that. Check your connection and try again.",
        );
        if (body?.error === "already_answered") await loadState();
        return;
      }

      prefetched.current = body.next ?? null;
      setPhase({
        name: "feedback",
        question: phase.question,
        feedback: body,
        attempt: {
          ...phase.attempt,
          score: body.score ?? phase.attempt.score,
          lives: body.lives_left ?? phase.attempt.lives,
        },
      });

      if (soundOn && body.action === "answer") {
        if (body.is_correct) playCorrect();
        else playWrong();
      }

      // Survival ends on the last life: show the outcome, then the result.
      if (body.finished || body.lives_left === 0) {
        window.setTimeout(() => router.replace(`/results/${attemptId}`), 1400);
      }
    } catch {
      setNotice("Could not reach the server. Your answer was not submitted.");
    } finally {
      setPending(false);
    }
  }

  // Announce the time only at thresholds, never every second.
  useEffect(() => {
    if (remainingMs === null || !liveRef.current) return;
    const seconds = Math.ceil(remainingMs / 1000);
    const threshold = seconds <= 10 ? 10 : seconds <= 30 ? 30 : null;
    if (threshold !== null && lastThreshold.current !== threshold) {
      lastThreshold.current = threshold;
      liveRef.current.textContent = `${threshold} seconds left`;
    }
    if (seconds === 0) liveRef.current.textContent = "Time is up";
  }, [remainingMs]);

  // Keyboard play: 1–4 answer the question, ignored while typing in a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (phase.name !== "question") return;

      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > 4) return;
      const option = phase.question.options[digit - 1];
      if (!option) return;

      event.preventDefault();
      setSelected(option.id);
      submitRef.current("answer", option.id);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  useEffect(() => {
    submitRef.current = submit;
  });

  // A new question takes focus, so the next prompt is read out rather than the old one.
  const currentPosition = phase.name === "question" ? phase.question.position : null;
  useEffect(() => {
    if (currentPosition === null) return;
    promptRef.current?.focus();
    // A new question starts a fresh announcement cycle; clearing the text keeps the
    // live region silent until the next threshold is crossed.
    lastThreshold.current = null;
    if (liveRef.current) liveRef.current.textContent = "";
  }, [currentPosition]);

  async function toggleBookmark() {
    if (phase.name !== "question" || !phase.question.question_id) return;
    const questionId = phase.question.question_id;
    const nextValue = !phase.question.bookmarked;
    setPhase({ ...phase, question: { ...phase.question, bookmarked: nextValue } });
    const response = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId, bookmarked: nextValue }),
    }).catch(() => null);
    if (!response?.ok) {
      setPhase({ ...phase, question: { ...phase.question, bookmarked: !nextValue } });
      setNotice("Could not update that bookmark.");
    }
  }

  async function next() {
    if ((phase.name !== "feedback" && phase.name !== "stale") || pending) return;
    setPending(true);
    setNotice(null);

    const queued = prefetched.current;
    prefetched.current = null;
    if (queued?.question && phase.name === "feedback") {
      setSelected(null);
      if (
        queued.attempt?.status === "completed" ||
        !queued.question ||
        queued.question.position === null
      ) {
        router.replace(`/results/${attemptId}`);
        return;
      }
      setPhase({ name: "question", question: queued.question, attempt: phase.attempt });
      setPending(false);
      return;
    }

    try {
      const response = await fetch(`/api/attempts/${attemptId}/next`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) {
        setNotice("Could not load the next question. Try again.");
        return;
      }

      setSelected(null);
      if (
        body.attempt?.status === "completed" ||
        !body.question ||
        body.question.position === null
      ) {
        // The server owns the counters; read the finished attempt back rather than
        // reporting numbers this screen assembled.
        router.replace(`/results/${attemptId}`);
        return;
      }

      setPhase({ name: "question", question: body.question, attempt: phase.attempt });
    } catch {
      setNotice("Could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function quit() {
    setConfirmExit(false);
    setPhase({ name: "quitting" });
    try {
      await fetch(`/api/attempts/${attemptId}/finish`, { method: "POST" });
    } finally {
      router.push("/play");
    }
  }

  if (phase.name === "loading" || phase.name === "quitting") {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-16" role="status">
        <p className="text-muted-foreground text-sm">
          {phase.name === "quitting" ? "Ending this quiz…" : "Loading your quiz…"}
        </p>
      </div>
    );
  }

  if (phase.name === "error") {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Quiz unavailable</h1>
        <p className="text-muted-foreground mt-2 text-sm">{phase.message}</p>
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

  if (phase.name === "stale") {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Already answered</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Question {phase.question.position} of {phase.question.total} was answered in another tab,
          so this one is out of date. Your score already includes it.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={next} disabled={pending}>
            {pending ? "Loading…" : "Continue"}
          </Button>
          <Link
            href="/play"
            className="border-border-strong bg-surface inline-flex h-11 items-center rounded-[var(--radius-control)] border px-4 text-[15px] font-medium"
          >
            Back to setup
          </Link>
        </div>
        {notice ? (
          <p className="text-danger mt-4 text-sm" role="alert">
            {notice}
          </p>
        ) : null}
      </div>
    );
  }

  if (phase.name === "done") {
    const { attempt } = phase;
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">
          {attempt.status === "completed"
            ? "Quiz complete"
            : attempt.status === "expired"
              ? "This quiz expired"
              : "Quiz ended early"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {attempt.status === "completed"
            ? `You answered all ${attempt.question_count} questions.`
            : attempt.status === "expired"
              ? "It was never started, and unused quizzes expire after an hour."
              : "This attempt was ended before the last question."}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        <p className="text-muted-foreground bg-surface-muted mt-4 rounded-[var(--radius-control)] p-3 text-xs leading-relaxed">
          A detailed results and review screen arrives in a later milestone; this page reports the
          server-stored outcome only.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => router.push("/play")}>Play again</Button>
          <Link
            href="/"
            className="border-border-strong bg-surface inline-flex h-11 items-center rounded-[var(--radius-control)] border px-4 text-[15px] font-medium"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const { question, attempt } = phase;
  const answered = phase.name === "feedback";
  const position = question.position ?? 0;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pt-4 pb-28 sm:pb-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-lg">
            <Compass className="size-4" aria-hidden="true" />
          </span>
          Quiz Atlas
        </Link>
        <div className="flex items-center gap-3">
          {remainingMs !== null ? (
            <span aria-hidden="true">
              <Badge tone={remainingMs <= 10000 ? "warning" : "neutral"}>
                {Math.ceil(remainingMs / 1000)}s left
              </Badge>
            </span>
          ) : null}
          {question.question_id ? (
            <Button
              variant="quiet"
              size="sm"
              onClick={toggleBookmark}
              aria-pressed={Boolean(question.bookmarked)}
              title={question.bookmarked ? "Remove bookmark" : "Bookmark this question"}
            >
              <Bookmark
                className={question.bookmarked ? "size-4 fill-current" : "size-4"}
                aria-hidden="true"
              />
              <span className="sr-only">
                {question.bookmarked ? "Remove bookmark" : "Bookmark this question"}
              </span>
            </Button>
          ) : null}
          {attempt.mode === "survival" ? (
            <Badge tone={Number(attempt.lives ?? 0) <= 1 ? "warning" : "neutral"}>
              {typeof attempt.lives === "number" ? attempt.lives : 3} live
              {attempt.lives === 1 ? "" : "s"}
            </Badge>
          ) : null}
          {attempt.mode === "daily" ? null : <Badge>{attempt.score} pts</Badge>}
          <Button
            variant="quiet"
            size="sm"
            aria-pressed={soundOn}
            onClick={() => setSoundEnabled(!soundOn)}
            title={soundOn ? "Sound on" : "Sound off"}
          >
            <span aria-hidden="true">{soundOn ? "♪" : "♪̸"}</span>
            <span className="sr-only">
              {soundOn ? "Turn answer sounds off" : "Turn answer sounds on"}
            </span>
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setConfirmExit(true)}>
            <LogOut className="size-4" aria-hidden="true" />
            Exit
          </Button>
        </div>
      </header>

      <div className="mb-6">
        <div className="text-muted-foreground mb-2 flex items-center justify-between text-xs font-medium">
          <span>
            Question {position} of {question.total}
          </span>
          <span className="capitalize">{attempt.status}</span>
        </div>
        <div
          className="bg-surface-muted h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={question.total}
          aria-valuenow={position}
          aria-label="Quiz progress"
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-300"
            style={{ width: `${(position / question.total) * 100}%` }}
          />
        </div>
      </div>

      <article>
        {question.stem ? (
          <p className="text-muted-foreground mb-3 text-[15px] leading-relaxed">{question.stem}</p>
        ) : null}

        {question.statements.length > 0 ? (
          <ol className="bg-surface-muted mb-4 space-y-2 rounded-[var(--radius-control)] p-4 text-[15px] leading-relaxed">
            {question.statements.map((statement, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-muted-foreground shrink-0 font-medium">{index + 1}.</span>
                <span>{statement}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {question.match ? <MatchLists match={question.match} /> : null}

        <h1
          ref={promptRef}
          tabIndex={-1}
          className="text-[22px] leading-snug font-semibold tracking-tight outline-none sm:text-[26px]"
        >
          {question.prompt}
        </h1>
        <p ref={liveRef} aria-live="polite" className="sr-only" />

        <fieldset className="mt-6" disabled={pending || answered}>
          <legend className="sr-only">Choose one answer</legend>
          <ul className="space-y-2">
            {question.options.map((option, index) => {
              const isSelected = selected === option.id;
              // Daily withholds the key, so nothing is marked right or wrong here.
              const revealed = answered && attempt.mode !== "daily";
              const isCorrect = revealed && phase.feedback.correct_option_id === option.id;
              const isWrongPick =
                revealed &&
                phase.feedback.action === "answer" &&
                selected === option.id &&
                !isCorrect;

              return (
                <li key={option.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-4 transition-colors",
                      isCorrect
                        ? "border-success bg-success-soft"
                        : isWrongPick
                          ? "border-danger bg-danger-soft"
                          : isSelected
                            ? "border-primary bg-primary-soft"
                            : "border-border bg-surface hover:border-border-strong",
                      (pending || answered) && "cursor-default",
                    )}
                  >
                    <input
                      type="radio"
                      name="option"
                      value={option.id}
                      checked={isSelected}
                      onChange={() => {
                        setSelected(option.id);
                        void submit("answer", option.id);
                      }}
                      disabled={pending || answered}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                        isCorrect
                          ? "border-success bg-success text-white"
                          : isWrongPick
                            ? "border-danger bg-danger text-white"
                            : isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border-strong",
                      )}
                      aria-hidden="true"
                    >
                      {isCorrect ? (
                        <Check className="size-3" />
                      ) : isWrongPick ? (
                        <X className="size-3" />
                      ) : (
                        String.fromCharCode(65 + index)
                      )}
                    </span>
                    <span className="text-[15px] leading-relaxed break-words">{option.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {answered ? (
          <>
            <AutoAdvance
              delayMs={
                attempt.mode === "daily"
                  ? 900
                  : attempt.mode === "time_rush"
                    ? 1200
                    : phase.feedback.explanation
                      ? 6000
                      : 3500
              }
              onAdvance={next}
            />
            <div
              className={cn(
                "mt-5 rounded-[var(--radius-card)] border p-4",
                attempt.mode === "daily"
                  ? "border-border bg-surface-muted"
                  : phase.feedback.action === "skip" || phase.feedback.action === "reveal"
                    ? "border-border bg-surface-muted"
                    : phase.feedback.is_correct
                      ? "border-success/50 bg-success-soft"
                      : "border-danger/50 bg-danger-soft",
              )}
              role="status"
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                {attempt.mode === "daily" ? (
                  "Answer saved"
                ) : phase.feedback.action === "reveal" ? (
                  "Answer revealed, no points"
                ) : phase.feedback.action === "skip" ? (
                  "Skipped, no points"
                ) : phase.feedback.is_correct ? (
                  <>
                    <Check className="text-success size-4" aria-hidden="true" /> Correct · +
                    {phase.feedback.points} points
                  </>
                ) : (
                  <>
                    <X className="text-danger size-4" aria-hidden="true" /> Incorrect, the answer
                    was{" "}
                    {String.fromCharCode(
                      65 +
                        question.options.findIndex(
                          (o) => o.id === phase.feedback.correct_option_id,
                        ),
                    )}
                  </>
                )}
              </p>
              {attempt.mode === "daily" ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  Correct answers and explanations unlock when today&rsquo;s challenge closes.
                </p>
              ) : null}
              {phase.feedback.explanation && attempt.mode !== "time_rush" ? (
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {phase.feedback.explanation}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {notice ? (
          <p className="text-danger mt-4 text-sm" role="alert">
            {notice}
          </p>
        ) : null}

        {question.question_version_id ? (
          <ReportQuestion questionVersionId={question.question_version_id} attemptId={attempt.id} />
        ) : null}
      </article>

      <div className="border-border bg-background/95 fixed inset-x-0 bottom-0 border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {answered ? (
          <Button className="w-full sm:w-auto" size="lg" onClick={next} disabled={pending}>
            {pending ? "Loading…" : "Next now"}
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="quiet"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => submit("skip")}
              disabled={pending}
            >
              {pending ? "Submitting…" : "Skip"}
            </Button>
            {attempt.mode === "practice" ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => submit("reveal")}
                disabled={pending}
              >
                <Eye className="size-4" aria-hidden="true" />
                Reveal answer
              </Button>
            ) : null}
            <p className="text-muted-foreground text-center text-xs sm:text-left">
              Pick an answer to submit it.
            </p>
          </div>
        )}
      </div>

      {confirmExit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-title"
        >
          <div className="bg-surface border-border w-full max-w-sm rounded-[var(--radius-card)] border p-5 shadow-xl">
            <h2 id="exit-title" className="text-base font-semibold">
              Leave this quiz?
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              The attempt ends now and cannot be resumed. Answers already submitted keep their
              score.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmExit(false)}>
                Keep playing
              </Button>
              <Button variant="primary" size="sm" onClick={quit}>
                End quiz
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
