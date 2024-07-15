import { z } from "zod";

export const createAttemptSchema = z.object({
  topics: z.array(z.string().min(1)).min(1, "choose at least one topic").max(8),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]),
  count: z.number().int().min(5).max(50),
  idempotencyKey: z.string().min(8).max(100),
});

export const submitAnswerSchema = z.object({
  position: z.number().int().min(1).max(50),
  optionId: z.number().int().min(1).max(4),
  idempotencyKey: z.string().min(8).max(100),
});

export type CreateAttemptInput = z.infer<typeof createAttemptSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
