"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Shuffle } from "lucide-react";
import { TopicIcon } from "@/features/topics/topic-icon";
import type { TopicFixture } from "@/features/topics/fixtures";

/** Five topics plus Mix fill the first 2x3 grid; everything else waits behind the toggle. */
const FIRST_VIEW = 5;

export function HomeTopicGrid({ topics }: { topics: TopicFixture[] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? topics : topics.slice(0, FIRST_VIEW);
  const hidden = topics.length - shown.length;

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <Link
            href="/play"
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

      {topics.length > FIRST_VIEW ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="border-border-strong bg-surface mt-3 inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border px-4 text-sm font-medium"
        >
          {open ? "Show fewer topics" : `Show all topics (${hidden} more)`}
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </>
  );
}
