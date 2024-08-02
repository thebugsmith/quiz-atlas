import { z } from "zod";

export const difficultyValues = ["easy", "medium", "hard", "mixed"] as const;
export type Difficulty = (typeof difficultyValues)[number];

export const countSchema = z.coerce.number().int().min(5).max(50);

export type SetupMode = "classic" | "time-rush" | "practice";
export type PracticeSource = "topics" | "bookmarks" | "missed";

export type SetupParams = {
  topics: string[];
  difficulty: Difficulty;
  count: number | null;
  mode: SetupMode;
  source: PracticeSource;
  quick: boolean;
  problems: string[];
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : (value ?? "");

/**
 * Parses the shareable setup from the URL. Invalid values are reported rather than
 * silently replaced: a link that says `count=99` must not quietly start a 50-question
 * quiz.
 */
export function parseSetupParams(params: RawParams): SetupParams {
  const problems: string[] = [];

  const topics = first(params.topics)
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => /^[a-z0-9-]+$/.test(slug))
    .slice(0, 8);
  if (first(params.topics) && topics.length === 0) problems.push("topics were not readable");

  const rawDifficulty = first(params.difficulty).toLowerCase();
  let difficulty: Difficulty = "mixed";
  if (rawDifficulty) {
    if ((difficultyValues as readonly string[]).includes(rawDifficulty)) {
      difficulty = rawDifficulty as Difficulty;
    } else {
      problems.push(`difficulty "${rawDifficulty}" is not one of ${difficultyValues.join(", ")}`);
    }
  }

  const rawCount = first(params.count);
  let count: number | null = null;
  if (rawCount) {
    const parsed = countSchema.safeParse(rawCount);
    if (parsed.success) count = parsed.data;
    else problems.push("count must be a whole number between 5 and 50");
  }

  const rawMode = first(params.mode).toLowerCase();
  let mode: SetupMode = "classic";
  if (rawMode) {
    if (rawMode === "classic" || rawMode === "practice") {
      mode = rawMode;
    } else if (rawMode === "time-rush" || rawMode === "time_rush") {
      mode = "time-rush";
    } else {
      problems.push(`mode "${rawMode}" is not one of classic, time_rush, practice`);
    }
  }

  const rawSource = first(params.source).toLowerCase();
  let source: PracticeSource = "topics";
  if (rawSource) {
    if (rawSource === "topics" || rawSource === "bookmarks" || rawSource === "missed") {
      source = rawSource;
    } else {
      problems.push(`source "${rawSource}" is not one of topics, bookmarks, missed`);
    }
  }

  return {
    topics,
    difficulty,
    count,
    mode,
    source,
    quick: first(params.quick) === "1",
    problems,
  };
}

/** Rebuilds the query string for the current setup, omitting defaults. */
export function buildSetupQuery(setup: {
  topics: string[];
  difficulty: Difficulty;
  count: number;
  mode?: SetupMode;
  source?: PracticeSource;
}) {
  const query = new URLSearchParams();
  if (setup.topics.length > 0) query.set("topics", setup.topics.join(","));
  if (setup.difficulty !== "mixed") query.set("difficulty", setup.difficulty);
  if (setup.count !== 10) query.set("count", String(setup.count));
  if (setup.mode && setup.mode !== "classic") query.set("mode", setup.mode);
  if (setup.source && setup.source !== "topics") query.set("source", setup.source);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}
