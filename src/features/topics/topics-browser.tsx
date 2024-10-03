"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TopicIcon } from "./topic-icon";
import { useTopics } from "./use-topics";

/** Searchable topic grid, fed by the live topic list and counts from `/api/topics`. */
export function TopicsBrowser() {
  const [query, setQuery] = useState("");
  const topics = useTopics();

  const results = useMemo(() => {
    const all = topics ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (topic) =>
        topic.name.toLowerCase().includes(needle) ||
        topic.description.toLowerCase().includes(needle),
    );
  }, [query, topics]);

  return (
    <div>
      <div className="relative max-w-md">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topics"
          aria-label="Search topics"
          className="border-border-strong bg-surface placeholder:text-muted-foreground h-11 w-full rounded-[var(--radius-control)] border pr-3 pl-9 text-[15px]"
        />
      </div>

      <p className="text-muted-foreground mt-3 text-sm" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? "topic" : "topics"}
        {query ? ` matching “${query}”` : ""}
      </p>

      {results.length === 0 ? (
        <div className="border-border-strong bg-surface mt-6 rounded-[var(--radius-card)] border border-dashed p-8 text-center">
          <p className="font-medium">No topics match that search.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Try a shorter word, or browse the full list.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-primary mt-4 text-sm font-medium hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((topic) => (
            <li key={topic.slug}>
              <Link
                href={`/play?topics=${topic.slug}`}
                className="border-border bg-surface hover:border-border-strong hover:bg-surface-muted flex h-full flex-col gap-3 rounded-[var(--radius-card)] border p-5 transition-colors"
              >
                <span className="flex items-center justify-between gap-3">
                  <TopicIcon topic={topic} />
                  <Badge>Pick in setup</Badge>
                </span>
                <span className="text-base font-medium">{topic.name}</span>
                <span className="text-muted-foreground text-sm leading-relaxed break-words">
                  {topic.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
