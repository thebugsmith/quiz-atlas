import { z } from "zod";
import { NextResponse } from "next/server";
import { rpc } from "@/features/quiz/api-helpers";
import { adminError, isDenied, requireAdmin } from "@/features/admin/guard";
import { csvRowToQuestion, parseCsv } from "@/features/admin/csv";
import { importQuestionSchema } from "@/features/questions/schema";
import { consume, LIMITS } from "@/features/ops/limits";
import { logApi } from "@/features/ops/log";
import { questionFingerprint } from "@/features/questions/fingerprint";

const bodySchema = z.object({
  content: z.string().min(1).max(2_000_000),
  format: z.enum(["json", "csv"]).default("json"),
  dryRun: z.boolean().default(true),
});

export type ImportOutcome = {
  row: number;
  externalId: string;
  outcome: "created" | "updated" | "unchanged" | "failed";
  detail?: string;
};

/**
 * Uploads run through the same Zod schema as `pnpm content:import`, so a spreadsheet
 * cannot introduce a question shape the authoring pipeline would reject. `dryRun`
 * reports every row without writing anything.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const response = await run(request);
  logApi({
    route: "POST /api/admin/import",
    method: "POST",
    status: response.status,
    durationMs: Date.now() - started,
    outcome: response.ok ? "ok" : "rejected",
  });
  return response;
}

async function run(request: Request) {
  const actor = await requireAdmin();
  if (isDenied(actor)) return actor;

  const budget = await consume(`import:${actor.id}`, LIMITS.import.limit, LIMITS.import.window);
  if (!budget.allowed) {
    return NextResponse.json({ error: "rate_limited", resetAt: budget.resetAt }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { content, format, dryRun } = parsed.data;

  let rawRows: unknown[];
  try {
    rawRows =
      format === "csv"
        ? parseCsv(content).map(csvRowToQuestion)
        : ((JSON.parse(content) as { questions?: unknown[] }).questions ??
          (JSON.parse(content) as unknown[]));
  } catch (error) {
    return NextResponse.json(
      { error: "unreadable_file", detail: error instanceof Error ? error.message : "parse failed" },
      { status: 400 },
    );
  }

  if (!Array.isArray(rawRows)) {
    return NextResponse.json(
      { error: "unreadable_file", detail: "expected a list of rows" },
      { status: 400 },
    );
  }

  const outcomes: ImportOutcome[] = [];

  for (const [index, raw] of rawRows.entries()) {
    const rowNumber = index + 1;
    const validated = importQuestionSchema.safeParse(raw);

    if (!validated.success) {
      outcomes.push({
        row: rowNumber,
        externalId: String((raw as { external_id?: string })?.external_id ?? ""),
        outcome: "failed",
        detail: validated.error.issues
          .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
          .join("; "),
      });
      continue;
    }

    const question = validated.data;

    if (dryRun) {
      outcomes.push({
        row: rowNumber,
        externalId: question.external_id,
        outcome: "unchanged",
        detail: "valid",
      });
      continue;
    }

    const { data, error } = await rpc<{ question_id: string; unchanged: boolean }>(
      "admin_question_save",
      {
        p_actor: actor.id,
        p_question_id: null,
        p_external_id: question.external_id,
        p_topic_slug: question.topic,
        p_difficulty: question.difficulty,
        p_question_type: question.type,
        p_stem: question.stem ?? null,
        p_statements: question.statements,
        p_prompt: question.prompt,
        p_options: question.options,
        p_correct_option_id: question.correct_option_id,
        p_explanation: question.explanation ?? null,
        p_content_hash: questionFingerprint(question),
      },
    );

    if (error || !data) {
      outcomes.push({
        row: rowNumber,
        externalId: question.external_id,
        outcome: "failed",
        detail: adminError(error ?? "") ? (error ?? "rejected") : "rejected",
      });
      continue;
    }

    outcomes.push({
      row: rowNumber,
      externalId: question.external_id,
      // A new external id arrives as a draft; an existing one gains a new draft version.
      outcome: data.unchanged ? "unchanged" : "updated",
    });
  }

  return NextResponse.json({
    dryRun,
    total: outcomes.length,
    valid: outcomes.filter((row) => row.outcome !== "failed").length,
    failed: outcomes.filter((row) => row.outcome === "failed").length,
    outcomes,
  });
}
