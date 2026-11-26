/**
 * Validated JSON importer for the question bank.
 *
 *   pnpm content:import --file data/questions/history.json --dry-run
 *   pnpm content:import --file data/questions/history.json
 *
 * Rows are validated with the shared Zod schema before anything is written.
 * Re-running the same file is a no-op: unchanged questions are skipped, changed
 * ones get a new version (versions in use are immutable in the database), and the
 * same content under a second external id is reported as a duplicate.
 *
 * The question bank lives in the private `content` schema, which PostgREST does
 * not expose, so this authoring tool talks to Postgres directly (DATABASE_URL)
 * instead of going through the API. Each row is written in its own transaction.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  importFileSchema,
  importQuestionSchema,
  type ImportQuestion,
} from "../src/features/questions/schema";
import { questionFingerprint } from "../src/features/questions/fingerprint";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL must be set in .env.local (the local stack prints it as DB_URL)");
  process.exit(2);
}

const args = process.argv.slice(2);
const fileArg = args.indexOf("--file");
const file: string | undefined = fileArg >= 0 ? args[fileArg + 1] : undefined;
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

if (!file) {
  console.error("Usage: pnpm content:import --file <path> [--dry-run] [--limit N]");
  process.exit(2);
}

const filePath: string = file;

const pool = new Pool({ connectionString: databaseUrl, max: 4 });

type Outcome = "created" | "updated" | "unchanged" | "failed";
type Result = { row: number; externalId: string; outcome: Outcome; detail?: string };

function failed(row: number, externalId: string, detail: string): Result {
  return { row, externalId, outcome: "failed", detail };
}

async function topicId(db: PoolClient, slug: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>("select id from content.topics where slug = $1", [
    slug,
  ]);
  return rows[0]?.id ?? null;
}

async function subtopicId(
  db: PoolClient,
  topicUuid: string,
  slug: string | undefined,
  name: string,
): Promise<string | null> {
  if (!slug) return null;
  const found = await db.query<{ id: string }>(
    "select id from content.subtopics where topic_id = $1 and slug = $2",
    [topicUuid, slug],
  );
  if (found.rows[0]) return found.rows[0].id;
  if (dryRun) return null;

  const created = await db.query<{ id: string }>(
    "insert into content.subtopics (topic_id, slug, name) values ($1, $2, $3) returning id",
    [topicUuid, slug, name || slug],
  );
  return created.rows[0].id;
}

async function applyQuestion(row: number, question: ImportQuestion): Promise<Result> {
  const hash = questionFingerprint(question);
  const db = await pool.connect();

  try {
    await db.query("begin");

    const topic = await topicId(db, question.topic);
    if (!topic) {
      await db.query("rollback");
      return failed(row, question.external_id, `unknown topic "${question.topic}"`);
    }

    const existing = await db.query<{
      id: string;
      current_version_id: string | null;
      content_hash: string | null;
      version_number: number | null;
      archived_at: string | null;
    }>(
      `select q.id, q.current_version_id, q.archived_at,
              v.content_hash, v.version_number
         from content.questions q
         left join content.question_versions v on v.id = q.current_version_id
        where q.external_id = $1`,
      [question.external_id],
    );
    const current = existing.rows[0];

    if (current && current.content_hash === hash && !current.archived_at) {
      await db.query("rollback");
      return { row, externalId: question.external_id, outcome: "unchanged" };
    }

    if (!current) {
      const twin = await db.query<{ external_id: string }>(
        `select q.external_id
           from content.question_versions v
           join content.questions q on q.id = v.question_id
          where v.content_hash = $1 and q.archived_at is null
          limit 1`,
        [hash],
      );
      if (twin.rows[0]) {
        await db.query("rollback");
        return failed(
          row,
          question.external_id,
          `identical content already imported as "${twin.rows[0].external_id}" (duplicate content)`,
        );
      }
    }

    const nextVersion = (current?.version_number ?? 0) + 1;

    if (dryRun) {
      await db.query("rollback");
      return {
        row,
        externalId: question.external_id,
        outcome: current ? "updated" : "created",
        detail: current ? `would add version ${nextVersion}` : undefined,
      };
    }

    let questionUuid = current?.id;
    if (!questionUuid) {
      const inserted = await db.query<{ id: string }>(
        `insert into content.questions (external_id, created_at)
         values ($1, coalesce($2::timestamptz, now()))
         returning id`,
        [question.external_id, question.added_at ? `${question.added_at}T00:00:00Z` : null],
      );
      questionUuid = inserted.rows[0].id;
    }

    const version = await db.query<{ id: string }>(
      `insert into content.question_versions
         (question_id, version_number, topic_id, subtopic_id, tags, difficulty, question_type,
          stem, statements, prompt, options, correct_option_id, explanation, content_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
       returning id`,
      [
        questionUuid,
        nextVersion,
        topic,
        await subtopicId(db, topic, question.subtopic, question.subtopic ?? ""),
        question.tags,
        question.difficulty,
        question.type,
        question.stem ?? null,
        question.statements,
        question.prompt,
        JSON.stringify(question.options),
        question.correct_option_id,
        question.explanation ?? null,
        hash,
        question.match ? JSON.stringify(question.match) : null,
      ],
    );

    await db.query(
      "update content.questions set current_version_id = $1, archived_at = null where id = $2",
      [version.rows[0].id, questionUuid],
    );

    await db.query("commit");
    return {
      row,
      externalId: question.external_id,
      outcome: current ? "updated" : "created",
      detail: current ? `version ${nextVersion}` : undefined,
    };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    return failed(
      row,
      question.external_id,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    db.release();
  }
}

async function main() {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const shape = importFileSchema.safeParse(raw);
  if (!shape.success) {
    console.error("File shape is invalid: expected an array of questions or { questions: [...] }");
    process.exit(2);
  }
  const rows = Array.isArray(shape.data) ? shape.data : shape.data.questions;
  const selected = limit ? rows.slice(0, limit) : rows;

  const results: Result[] = [];
  const seenIds = new Map<string, number>();
  const seenHashes = new Map<string, number>();

  for (const [index, row] of selected.entries()) {
    const parsed = importQuestionSchema.safeParse(row);
    const externalId =
      typeof (row as { external_id?: unknown })?.external_id === "string"
        ? (row as { external_id: string }).external_id
        : `row ${index + 1}`;

    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)
        .join("; ");
      results.push(failed(index + 1, externalId, detail));
      continue;
    }

    const question = parsed.data;
    if (seenIds.has(question.external_id)) {
      results.push(
        failed(
          index + 1,
          externalId,
          `external_id also used on row ${seenIds.get(question.external_id)}`,
        ),
      );
      continue;
    }
    seenIds.set(question.external_id, index + 1);

    const hash = questionFingerprint(question);
    if (seenHashes.has(hash)) {
      results.push(
        failed(
          index + 1,
          externalId,
          `identical content to row ${seenHashes.get(hash)} in this file`,
        ),
      );
      continue;
    }
    seenHashes.set(hash, index + 1);

    try {
      results.push(await applyQuestion(index + 1, question));
    } catch (error) {
      results.push(
        failed(index + 1, externalId, error instanceof Error ? error.message : String(error)),
      );
    }
  }

  const totals = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  for (const result of results) totals[result.outcome] += 1;

  console.log(
    `${dryRun ? "DRY RUN — " : ""}${filePath}: ${results.length} rows -> ` +
      `created ${totals.created}, updated ${totals.updated}, unchanged ${totals.unchanged}, failed ${totals.failed}`,
  );

  const problems = results.filter((result) => result.outcome === "failed");
  for (const problem of problems.slice(0, 25)) {
    console.log(`  row ${problem.row} (${problem.externalId}): ${problem.detail}`);
  }
  if (problems.length > 25) console.log(`  ... and ${problems.length - 25} more failures`);

  await pool.end();
  if (problems.length > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
