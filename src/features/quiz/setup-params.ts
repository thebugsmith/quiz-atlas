import { z } from "zod";

export const difficultyValues = ["easy", "medium", "hard", "mixed"] as const;
export type Difficulty = (typeof difficultyValues)[number];

export const countSchema = z.coerce.number().int().min(5).max(50);

export type SetupParams = {
  topics: string[];
  difficulty: Difficulty;
  count: number | null;
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

  return { topics, difficulty, count, quick: first(params.quick) === "1", problems };
}

/** Rebuilds the query string for the current setup, omitting defaults. */
export function buildSetupQuery(setup: {
  topics: string[];
  difficulty: Difficulty;
  count: number;
}) {
  const query = new URLSearchParams();
  if (setup.topics.length > 0) query.set("topics", setup.topics.join(","));
  if (setup.difficulty !== "mixed") query.set("difficulty", setup.difficulty);
  if (setup.count !== 10) query.set("count", String(setup.count));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}
