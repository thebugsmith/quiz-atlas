"use client";

import Link from "next/link";
import { Shuffle } from "lucide-react";
import { TopicIcon } from "@/features/topics/topic-icon";
import { useTopics } from "@/features/topics/use-topics";

/** Five topics plus Mix fill the first 2x3 grid; /topics holds the full list. */
const FIRST_VIEW = 5;

export function HomeTopicGrid() {
  const topics = useTopics();
  const shown = (topics ?? []).slice(0, FIRST_VIEW);

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <li>
        <Link
          href="/play?mix=1"
          className="group border-primary/40 bg-primary-soft hover:border-primary flex h-full items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors"
        >
          <span className="bg-primary text-primary-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Shuffle className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-medium">Mix all topics</span>
            <span className="text-muted-foreground mt-0.5 block text-sm leading-relaxed break-words">
              Questions from everything, or narrow it down on the setup screen.
            </span>
          </span>
        </Link>
      </li>

      {topics === null
        ? Array.from({ length: FIRST_VIEW }, (_, index) => (
            <li key={`loading-${index}`}>
              <span className="border-border bg-surface flex h-full items-start gap-3 rounded-[var(--radius-card)] border p-4">
                <span className="bg-surface-muted size-10 shrink-0 animate-pulse rounded-xl" />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="bg-surface-muted block h-4 w-24 animate-pulse rounded" />
                  <span className="bg-surface-muted block h-3 w-full animate-pulse rounded" />
                </span>
              </span>
            </li>
          ))
        : null}

      {shown.map((topic) => (
        <li key={topic.slug}>
          <Link
            href={`/play?topics=${topic.slug}`}
            className="group border-border bg-surface hover:border-border-strong hover:bg-surface-muted flex h-full items-start gap-3 rounded-[var(--radius-card)] border p-4 transition-colors"
          >
            <TopicIcon topic={topic} />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{topic.name}</span>
              <span className="text-muted-foreground mt-0.5 block text-sm leading-relaxed break-words">
                {topic.description}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
