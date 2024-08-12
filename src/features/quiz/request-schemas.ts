import { z } from "zod";

export const createAttemptSchema = z
  .object({
    mode: z.enum(["classic", "time_rush", "practice", "survival"]).default("classic"),
    source: z.enum(["topics", "bookmarks", "missed"]).default("topics"),
    topics: z.array(z.string().min(1)).min(1, "choose at least one topic").max(8),
    difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
    count: z.number().int().min(1).max(50).default(10),
    durationSeconds: z.union([z.literal(30), z.literal(60), z.literal(120)]).optional(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine((value) => value.mode !== "time_rush" || value.durationSeconds !== undefined, {
    message: "time rush needs a duration",
    path: ["durationSeconds"],
  });

export const submitAnswerSchema = z
  .object({
    position: z.number().int().min(1).max(200),
    action: z.enum(["answer", "skip", "reveal"]).default("answer"),
    optionId: z.number().int().min(1).max(4).nullable().default(null),
    idempotencyKey: z.string().min(8).max(100),
  })
  .refine((value) => value.action !== "answer" || value.optionId !== null, {
    message: "an answer needs an option",
    path: ["optionId"],
  });

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
