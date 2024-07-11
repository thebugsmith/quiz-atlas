import { z } from "zod";

/**
 * The authoring/import shape for one question. Both supported kinds share it:
 *
 * - `mcq`          a plain question: prompt + four options.
 * - `comprehension` a stem and/or numbered statements, then the prompt that asks
 *                  about them ("How many of the above are incorrect?").
 *
 * Deliberately absent: sources, licence notes, verification dates and publication
 * status. The bank records when a question was added (`added_at`, stored as the
 * question's created_at) and an answer that is defensible; nothing else is needed
 * to play or to review later.
 */

export const optionSchema = z.object({
  id: z.number().int().min(1).max(4),
  text: z.string().trim().min(1).max(500),
});

const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase words separated by hyphens");

export const importQuestionSchema = z
  .object({
    external_id: z.string().trim().min(3).max(120),
    topic: slugSchema,
    subtopic: slugSchema.optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    type: z.enum(["mcq", "comprehension"]).default("mcq"),
    stem: z.string().trim().min(1).max(1000).optional(),
    statements: z.array(z.string().trim().min(1).max(1000)).max(8).default([]),
    prompt: z.string().trim().min(5).max(1000),
    options: z.array(optionSchema).length(4, "exactly four options are required"),
    correct_option_id: z.number().int(),
    explanation: z.string().trim().min(5).max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    added_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
      .optional(),
  })
  .superRefine((question, ctx) => {
    const ids = new Set(question.options.map((option) => option.id));
    if (ids.size !== question.options.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "option ids must be distinct" });
    }

    const texts = question.options.map((option) =>
      option.text.trim().toLowerCase().replace(/\s+/g, " "),
    );
    if (new Set(texts).size !== texts.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "option texts must be distinct",
      });
    }

    if (!ids.has(question.correct_option_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["correct_option_id"],
        message: `correct_option_id ${question.correct_option_id} is not one of the option ids`,
      });
    }

    if (question.type === "comprehension" && !question.stem && question.statements.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["statements"],
        message: "a comprehension question needs a stem or at least one statement",
      });
    }

    if (question.type === "mcq" && question.statements.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["statements"],
        message: "plain mcq questions carry no statements; use type comprehension",
      });
    }
  });

export type ImportQuestion = z.infer<typeof importQuestionSchema>;
export type QuestionOption = z.infer<typeof optionSchema>;

export const importFileSchema = z.union([
  z.array(z.unknown()),
  z.object({ questions: z.array(z.unknown()) }),
]);
