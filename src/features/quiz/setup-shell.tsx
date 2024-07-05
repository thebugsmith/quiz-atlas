"use client";

import { useState } from "react";
import { Check, Info, Layers, Timer, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { difficultyOptions, topicFixtures, type DifficultyValue } from "@/features/topics/fixtures";
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

const questionCounts = [10, 20, 30] as const;

/**
 * Setup shell. The controls are real and hold state, but nothing is submitted:
 * the game server and its validation arrive in later milestones, and this screen
 * must not pretend a quiz started.
 */
export function SetupShell() {
  const [selected, setSelected] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyValue>("mixed");
  const [mode, setMode] = useState<ModeOption["value"]>("classic");
  const [count, setCount] = useState<(typeof questionCounts)[number]>(10);

  const allSelected = selected.length === 0;
  const selectedNames = allSelected
    ? "All topics"
    : topicFixtures
        .filter((topic) => selected.includes(topic.slug))
        .map((topic) => topic.name)
        .join(", ");

  function toggleTopic(slug: string) {
    setSelected((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-6">
        <section aria-labelledby="topics-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="topics-heading" className="text-lg font-semibold tracking-tight">
              Topics
            </h2>
            <button
              type="button"
              onClick={() => setSelected([])}
              disabled={allSelected}
              className="text-primary disabled:text-muted-foreground text-sm font-medium hover:underline disabled:no-underline"
            >
              All topics
            </button>
          </div>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {topicFixtures.map((topic) => {
              const active = selected.includes(topic.slug);
              return (
                <li key={topic.slug}>
                  <button
                    type="button"
                    onClick={() => toggleTopic(topic.slug)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-surface hover:border-border-strong hover:bg-surface-muted",
                    )}
                  >
                    <TopicIcon topic={topic} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{topic.name}</span>
                      <span className="text-muted-foreground block text-xs leading-snug">
                        {topic.description}
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
            {modes.map(({ value, name, description, Icon, available }) => {
              const active = mode === value && available;
              return (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => available && setMode(value)}
                    disabled={!available}
                    aria-pressed={active}
                    className={cn(
                      "flex h-full w-full flex-col gap-1.5 rounded-[var(--radius-control)] border p-4 text-left transition-colors",
                      active
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-surface hover:border-border-strong",
                      !available && "hover:border-border cursor-not-allowed opacity-70",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Icon
                        className={cn("size-4", active ? "text-primary" : "text-muted-foreground")}
                        aria-hidden="true"
                      />
                      {available ? null : <Badge>Coming next</Badge>}
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
          <div className="flex flex-wrap gap-2">
            {questionCounts.map((value) => {
              const active = count === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCount(value)}
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
            <dd className="font-medium">{count}</dd>
          </div>
        </dl>

        <div className="bg-surface-muted text-muted-foreground mt-5 flex items-start gap-2 rounded-[var(--radius-control)] p-3 text-xs leading-relaxed">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            The game server is not connected yet, so Start stays disabled. Available question counts
            appear once the bank is imported.
          </p>
        </div>

        <Button className="mt-4 w-full" size="lg" disabled aria-describedby="start-note">
          Start quiz
        </Button>
        <p id="start-note" className="text-muted-foreground mt-2 text-center text-xs">
          Playable from the Classic backend milestone.
        </p>
      </Card>
    </div>
  );
}
