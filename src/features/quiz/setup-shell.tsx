"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Info, Layers, Timer, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TopicIcon } from "@/features/topics/topic-icon";
import { cn } from "@/lib/cn";

type ModeOption = {
  value: "classic" | "time-rush" | "practice" | "daily" | "survival";
  name: string;
  description: string;
  Icon: typeof Layers;
  available: boolean;
};

const modes: ModeOption[] = [
  {
    value: "classic",
    name: "Classic",
    description: "A fixed number of questions, no clock pressure.",
    Icon: Layers,
    available: true,
  },
  {
    value: "time-rush",
    name: "Time Rush",
    description: "Answer as many as you can before the timer runs out.",
    Icon: Timer,
    available: false,
  },
  {
    value: "practice",
    name: "Practice",
    description: "Untimed, explanations straight away, bookmarks included.",
    Icon: Trophy,
    available: false,
  },
  {
    value: "survival",
    name: "Survival",
    description: "Three lives. One wrong answer costs a life.",
    Icon: Trophy,
    available: false,
  },
];

const difficultyOptions = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
  { value: "mixed", label: "Mixed" },
] as const;

type DifficultyValue = (typeof difficultyOptions)[number]["value"];

type TopicSummary = {
  slug: string;
  name: string;
  description: string;
  available: number;
};

const questionCounts = [5, 10, 20, 50] as const;

/**
 * `initialTopics` comes from the home page. When it names topics, those are locked in
 * and the picker is hidden; with none, the setup is mixed and the picker is shown.
 */
export function SetupShell({ initialTopics = [] }: { initialTopics?: string[] }) {
  const router = useRouter();
  const [topics, setTopics] = useState<TopicSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(initialTopics);
  const [locked, setLocked] = useState(initialTopics.length > 0);
  const [difficulty, setDifficulty] = useState<DifficultyValue>("mixed");
  const [mode, setMode] = useState<ModeOption["value"]>("classic");
  const [count, setCount] = useState<(typeof questionCounts)[number]>(10);
  const [customCount, setCustomCount] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // One key per setup intent, so a retried start cannot create a second quiz. It is
  // created on the first click rather than during render: a prerendered page must not
  // bake a random value into the static HTML.
  const createKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/topics")
      .then((response) => response.json())
      .then((body) => {
        if (cancelled) return;
        const loaded: TopicSummary[] = body.topics ?? [];
        setTopics(loaded);
        // A shared link may name a topic that no longer exists; fall back to mixed
        // rather than starting a quiz that can only fail.
        if (initialTopics.length > 0) {
          const known = initialTopics.filter((slug) => loaded.some((t) => t.slug === slug));
          if (known.length === 0) {
            setLocked(false);
            setSelected([]);
          } else {
            setSelected(known);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load topics. Try reloading the page.");
      });
    return () => {
      cancelled = true;
    };
    // The topics list is loaded once per visit; the incoming selection is a server
    // prop that does not change while this screen is mounted.
  }, [initialTopics]);

  const allSelected = selected.length === 0;
  const selectedNames = allSelected
    ? "All topics"
    : (topics ?? [])
        .filter((topic) => selected.includes(topic.slug))
        .map((topic) => topic.name)
        .join(", ");

  const available = useMemo(() => {
    if (!topics) return 0;
    return topics
      .filter((topic) => allSelected || selected.includes(topic.slug))
      .reduce((total, topic) => total + topic.available, 0);
  }, [topics, selected, allSelected]);

  // A shared link can name a topic with fewer questions than the default count; the
  // setup then defaults to what the topic actually has instead of disabling Start.
  const autoCount = locked && available > 0 && available < count ? available : null;
  const effectiveCount = customCount ? Number(customCount) : (autoCount ?? count);
  const countValid =
    Number.isInteger(effectiveCount) && effectiveCount >= 5 && effectiveCount <= 50;
  const enoughQuestions = countValid && available >= effectiveCount;
  const canStart = !starting && topics !== null && enoughQuestions;

  function toggleTopic(slug: string) {
    setSelected((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  }

  async function startQuiz() {
    if (!canStart) return;
    setStarting(true);
    setStartError(null);

    try {
      createKey.current ??= crypto.randomUUID();
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topics: allSelected ? (topics ?? []).map((topic) => topic.slug) : selected,
          difficulty,
          count: effectiveCount,
          idempotencyKey: createKey.current,
        }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.attempt_id) {
        if (body?.error === "insufficient_inventory") {
          setStartError(
            `Only ${body.available} question${body.available === 1 ? "" : "s"} match that setup.`,
          );
        } else if (body?.error === "unauthenticated") {
          setStartError("Your session expired. Reload the page to start a new one.");
        } else {
          setStartError("Could not start the quiz. Try again.");
        }
        return;
      }

      // The key belongs to this start only. Keeping it would make the next "Start
      // quiz" resolve to the same attempt — which, once finished, shows that old
      // result instead of a new quiz.
      createKey.current = null;
      router.push(`/quiz/${body.attempt_id}`);
    } catch {
      setStartError("Could not reach the server. Try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-6">
        <section aria-labelledby="topics-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="topics-heading" className="text-lg font-semibold tracking-tight">
              Topics
            </h2>
            {locked ? (
              <Link href="/" className="text-primary text-sm font-medium hover:underline">
                Change
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setSelected([])}
                disabled={allSelected}
                className="text-primary disabled:text-muted-foreground text-sm font-medium hover:underline disabled:no-underline"
              >
                Mix all topics
              </button>
            )}
          </div>

          {locked ? (
            <div className="flex flex-wrap gap-2">
              {(topics ?? [])
                .filter((topic) => selected.includes(topic.slug))
                .map((topic) => (
                  <Badge key={topic.slug} tone="primary">
                    {topic.name}
                    <span className="text-muted-foreground">· {topic.available}</span>
                  </Badge>
                ))}
              {topics === null ? (
                <span className="text-muted-foreground text-sm">Loading…</span>
              ) : null}
              {topics !== null && selected.length === 0 ? (
                <span className="text-muted-foreground text-sm">No topics selected.</span>
              ) : null}
            </div>
          ) : null}

          {locked ? null : loadError ? (
            <p className="text-danger text-sm" role="alert">
              {loadError}
            </p>
          ) : topics === null ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <li key={index} className="bg-surface-muted h-16 animate-pulse rounded-xl" />
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {topics.map((topic) => {
                const active = selected.includes(topic.slug);
                const empty = topic.available === 0;
                return (
                  <li key={topic.slug}>
                    <button
                      type="button"
                      onClick={() => toggleTopic(topic.slug)}
                      disabled={empty}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary-soft"
                          : "border-border bg-surface hover:border-border-strong hover:bg-surface-muted",
                        empty && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <TopicIcon
                        topic={{
                          slug: topic.slug,
                          name: topic.name,
                          description: topic.description,
                          icon: "history",
                          accent: "blue",
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">{topic.name}</span>
                        <span className="text-muted-foreground block text-xs leading-snug">
                          {empty ? "No questions yet" : `${topic.available} questions`}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-full border",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border-strong",
                        )}
                        aria-hidden="true"
                      >
                        {active ? <Check className="size-3" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="difficulty-heading">
          <h2 id="difficulty-heading" className="mb-3 text-lg font-semibold tracking-tight">
            Difficulty
          </h2>
          <div className="inline-flex flex-wrap gap-2">
            {difficultyOptions.map((option) => {
              const active = difficulty === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDifficulty(option.value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="mode-heading">
          <h2 id="mode-heading" className="mb-3 text-lg font-semibold tracking-tight">
            Format
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {modes.map(({ value, name, description, Icon, available: modeAvailable }) => {
              const active = mode === value && modeAvailable;
              return (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => modeAvailable && setMode(value)}
                    disabled={!modeAvailable}
                    aria-pressed={active}
                    className={cn(
                      "flex h-full w-full flex-col gap-1.5 rounded-[var(--radius-control)] border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-surface hover:border-border-strong",
                      !modeAvailable && "hover:border-border cursor-not-allowed opacity-70",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Icon
                        className={cn("size-4", active ? "text-primary" : "text-muted-foreground")}
                        aria-hidden="true"
                      />
                      {modeAvailable ? null : <Badge>Coming next</Badge>}
                    </span>
                    <span className="text-[15px] font-medium">{name}</span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="count-heading">
          <h2 id="count-heading" className="mb-3 text-lg font-semibold tracking-tight">
            Questions
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {questionCounts.map((value) => {
              const active = !customCount && count === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setCount(value);
                    setCustomCount("");
                  }}
                  aria-pressed={active}
                  className={cn(
                    "h-10 min-w-14 rounded-[var(--radius-control)] border px-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  {value}
                </button>
              );
            })}
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              or
              <input
                type="number"
                inputMode="numeric"
                min={5}
                max={50}
                value={customCount}
                onChange={(event) => setCustomCount(event.target.value)}
                placeholder="5–50"
                aria-label="Custom number of questions"
                className="border-border-strong bg-surface h-10 w-24 rounded-[var(--radius-control)] border px-3 text-sm"
              />
            </label>
          </div>
        </section>
      </div>

      <Card className="lg:sticky lg:top-20">
        <h2 className="text-lg font-semibold tracking-tight">Your setup</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Topics</dt>
            <dd className="max-w-[60%] text-right font-medium break-words">{selectedNames}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Difficulty</dt>
            <dd className="font-medium capitalize">{difficulty}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Format</dt>
            <dd className="font-medium">
              {modes.find((item) => item.value === mode)?.name ?? "Classic"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Questions</dt>
            <dd className="font-medium">{countValid ? effectiveCount : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Available</dt>
            <dd className="font-medium">{topics === null ? "…" : available}</dd>
          </div>
        </dl>

        {topics !== null && !enoughQuestions ? (
          <div className="bg-surface-muted text-muted-foreground mt-4 flex items-start gap-2 rounded-[var(--radius-control)] p-3 text-xs leading-relaxed">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p>
              {available === 0
                ? "No questions match this setup yet. Try another topic."
                : `This setup has ${available} question${available === 1 ? "" : "s"} available. Choose a smaller count or widen the topics.`}
            </p>
          </div>
        ) : null}

        {startError ? (
          <p className="text-danger mt-3 text-sm" role="alert">
            {startError}
          </p>
        ) : null}

        <Button className="mt-4 w-full" size="lg" disabled={!canStart} onClick={startQuiz}>
          {starting ? "Starting…" : "Start quiz"}
        </Button>
        <p className="text-muted-foreground mt-2 text-center text-xs">
          {countValid ? effectiveCount : "—"} questions · {difficulty}
        </p>
      </Card>
    </div>
  );
}
