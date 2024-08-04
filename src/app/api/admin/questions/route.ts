import { z } from "zod";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";
import { questionFingerprint } from "@/features/questions/fingerprint";
import { NextResponse } from "next/server";

const saveSchema = z.object({
  questionId: z.string().uuid().nullable().default(null),
  externalId: z.string().trim().min(3).max(120),
  topicSlug: z.string().trim().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  type: z.enum(["mcq", "comprehension"]),
  stem: z.string().trim().max(1000).nullable().default(null),
  statements: z.array(z.string().trim().min(1).max(1000)).max(8).default([]),
  prompt: z.string().trim().min(5).max(1000),
  options: z
    .array(
      z.object({ id: z.number().int().min(1).max(4), text: z.string().trim().min(1).max(500) }),
    )
    .length(4),
  correctOptionId: z.number().int().min(1).max(4),
  explanation: z.string().trim().max(2000).nullable().default(null),
});

export async function GET(request: Request) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const url = new URL(request.url);
  const { data, error } = await rpc<{ questions: unknown[] }>("admin_question_search", {
    p_actor: actor.id,
    p_query: url.searchParams.get("query") ?? "",
    p_topic_slug: url.searchParams.get("topic") ?? "",
    p_difficulty: url.searchParams.get("difficulty") ?? "",
    p_type: url.searchParams.get("type") ?? "",
    p_state: url.searchParams.get("state") ?? "live",
    p_limit: Number(url.searchParams.get("limit") ?? 50),
  });

  if (error || !data) {
    return (
      adminError(error ?? "") ?? NextResponse.json({ error: "search_failed" }, { status: 500 })
    );
  }
  return NextResponse.json(data);
}

/** Saves a new version. Never touched the old one, so history stays readable. */
export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const { data, error } = await rpc<{
    question_id: string;
    version_id: string;
    version_number: number;
    unchanged: boolean;
  }>("admin_question_save", {
    p_actor: actor.id,
    p_question_id: input.questionId,
    p_external_id: input.externalId,
    p_topic_slug: input.topicSlug,
    p_difficulty: input.difficulty,
    p_question_type: input.type,
    p_stem: input.stem,
    p_statements: input.statements,
    p_prompt: input.prompt,
    p_options: input.options,
    p_correct_option_id: input.correctOptionId,
    p_explanation: input.explanation,
    // Same fingerprint the import pipeline uses, so the two paths agree on "unchanged".
    p_content_hash: questionFingerprint({
      external_id: input.externalId,
      topic: input.topicSlug,
      difficulty: input.difficulty,
      type: input.type,
      stem: input.stem ?? undefined,
      statements: input.statements,
      prompt: input.prompt,
      options: input.options,
      correct_option_id: input.correctOptionId,
      explanation: input.explanation ?? undefined,
      tags: [],
    }),
  });

  if (error || !data) {
    return adminError(error ?? "") ?? NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}
