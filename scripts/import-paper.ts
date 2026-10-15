/**
 * Paper importer: one exam sitting with its questions, in one or more languages.
 *
 *   pnpm paper:import --file data/papers/neet-ug-2025.json [--dry-run]
 *
 * The JSON is produced by a throwaway parser (kept outside the repo) and validated
 * here: every question needs four distinct options, the same option ids in every
 * language, and a correct id that exists. Nothing is written for a row that fails.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

type LocaleText = {
  prompt: string;
  stem?: string | null;
  statements?: string[];
  options: { id: number; text: string }[];
  explanation?: string | null;
};

type Question = {
  externalId: string;
  topic: string;
  subtopic?: string | null;
  section: string;
  position: number;
  difficulty?: "easy" | "medium" | "hard";
  type?: "mcq" | "comprehension";
  correctOptionId: number;
  tags?: string[];
  locales: Record<string, LocaleText>;
};

type PaperFile = {
  exam: { slug: string; name: string; description?: string; family?: string; sortOrder?: number };
  paper: {
    slug: string;
    year: number;
    date?: string | null;
    shift?: string | null;
    label?: string | null;
    durationMinutes?: number | null;
    marksCorrect?: number;
    marksWrong?: number;
    publish?: boolean;
    /** How the content was established. Defaults to a reviewed reconstruction. */
    sourceStatus?: "official_verified" | "reviewed_reconstruction" | "synthetic";
  };
  questions: Question[];
};

/** sha256 over a key-sorted serialisation: the column's check wants 64 hex chars. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function problems(question: Question): string[] {
  const found: string[] = [];
  const ids = new Set<number>();
  for (const [locale, text] of Object.entries(question.locales)) {
    if (!text.prompt || text.prompt.trim().length < 5) found.push(`${locale}: prompt too short`);
    if (!Array.isArray(text.options) || text.options.length !== 4)
      found.push(`${locale}: needs exactly four options`);
    const localeIds = (text.options ?? [])
      .map((option) => option.id)
      .sort()
      .join(",");
    if (localeIds !== "1,2,3,4") found.push(`${locale}: option ids must be 1,2,3,4`);
    for (const option of text.options ?? []) {
      if (!option.text || option.text.trim().length === 0) found.push(`${locale}: empty option`);
      if (option.text.length > 500) found.push(`${locale}: option over 500 chars`);
      ids.add(option.id);
    }
  }
  if (!ids.has(question.correctOptionId)) found.push("correct_option_id not in options");
  return found;
}

async function topicId(client: PoolClient, slug: string) {
  const { rows } = await client.query<{ id: string }>(
    "select id from content.topics where slug = $1",
    [slug],
  );
  return rows[0]?.id ?? null;
}

async function subtopicId(client: PoolClient, topic: string, slug: string) {
  const { rows } = await client.query<{ id: string }>(
    `select s.id from content.subtopics s join content.topics t on t.id = s.topic_id
      where t.slug = $1 and s.slug = $2`,
    [topic, slug],
  );
  return rows[0]?.id ?? null;
}

async function main() {
  const fileArg = process.argv.indexOf("--file");
  if (fileArg === -1) {
    console.error("Usage: pnpm paper:import --file data/papers/<paper>.json [--dry-run]");
    process.exitCode = 1;
    return;
  }
  const dryRun = process.argv.includes("--dry-run");
  const data = JSON.parse(readFileSync(process.argv[fileArg + 1], "utf8")) as PaperFile;

  const rejected = data.questions
    .map((question) => ({ id: question.externalId, issues: problems(question) }))
    .filter((entry) => entry.issues.length > 0);

  console.log(
    `${data.paper.slug}: ${data.questions.length} questions, ${rejected.length} rejected`,
  );
  for (const entry of rejected.slice(0, 10)) console.log(`  ✗ ${entry.id}: ${entry.issues[0]}`);

  if (dryRun || rejected.length > 0) {
    if (rejected.length > 0) process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const counts = { questions: 0, versions: 0, sections: 0, members: 0 };

  try {
    await client.query("begin");

    const { rows: examRows } = await client.query<{ id: string }>(
      `insert into content.exams (slug, name, description, family, sort_order)
       values ($1, $2, coalesce($3, ''), $4, coalesce($5, 100))
       on conflict (slug) do update set name = excluded.name, description = excluded.description
       returning id`,
      [
        data.exam.slug,
        data.exam.name,
        data.exam.description ?? null,
        data.exam.family ?? null,
        data.exam.sortOrder ?? null,
      ],
    );
    const examId = examRows[0].id;

    const { rows: paperRows } = await client.query<{ id: string }>(
      `insert into content.papers
         (exam_id, slug, year, exam_date, shift_label, paper_label, duration_seconds,
          marks_correct, marks_wrong, status, published_at, supported_types,
          question_count, source_status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{single_choice}',
               $12, $13)
       on conflict (slug) do update set
         year = excluded.year, exam_date = excluded.exam_date, shift_label = excluded.shift_label,
         paper_label = excluded.paper_label, duration_seconds = excluded.duration_seconds,
         marks_correct = excluded.marks_correct, marks_wrong = excluded.marks_wrong,
         status = excluded.status, published_at = excluded.published_at,
         supported_types = excluded.supported_types,
         question_count = excluded.question_count,
         source_status = excluded.source_status
       returning id`,
      [
        examId,
        data.paper.slug,
        data.paper.year,
        data.paper.date ?? null,
        data.paper.shift ?? null,
        data.paper.label ?? null,
        data.paper.durationMinutes ? data.paper.durationMinutes * 60 : null,
        data.paper.marksCorrect ?? 1,
        data.paper.marksWrong ?? 0,
        data.paper.publish ? "published" : "draft",
        data.paper.publish ? new Date() : null,
        data.questions.length,
        data.paper.sourceStatus ?? "reviewed_reconstruction",
      ],
    );
    const paperId = paperRows[0].id;

    const sectionIds = new Map<string, string>();
    const subjects = [...new Set(data.questions.map((question) => question.section))];
    for (const [index, subject] of subjects.entries()) {
      const topic = data.questions.find((question) => question.section === subject)?.topic ?? null;
      const { rows } = await client.query<{ id: string }>(
        `insert into content.paper_sections (paper_id, subject, topic_id, position)
         values ($1, $2, $3, $4)
         on conflict (paper_id, subject) do update set position = excluded.position
         returning id`,
        [paperId, subject, topic ? await topicId(client, topic) : null, index + 1],
      );
      sectionIds.set(subject, rows[0].id);
      counts.sections += 1;
    }

    for (const question of data.questions) {
      const topic = await topicId(client, question.topic);
      const subtopic = question.subtopic
        ? await subtopicId(client, question.topic, question.subtopic)
        : null;
      if (!topic) throw new Error(`unknown topic ${question.topic} on ${question.externalId}`);

      const { rows: questionRows } = await client.query<{ id: string }>(
        `insert into content.questions (external_id)
         values ($1)
         on conflict (external_id) do update set updated_at = now()
         returning id`,
        [question.externalId],
      );
      const questionId = questionRows[0].id;
      counts.questions += 1;

      let defaultVersionId: string | null = null;
      for (const [locale, text] of Object.entries(question.locales)) {
        const hash = fingerprint({ locale, ...text, correct: question.correctOptionId });
        const { rows: existing } = await client.query<{ id: string; content_hash: string }>(
          `select id, content_hash from content.question_versions
            where question_id = $1 and locale = $2 order by version_number desc limit 1`,
          [questionId, locale],
        );
        if (existing[0]?.content_hash === hash) {
          await client.query(
            `insert into content.question_localizations (question_id, locale, current_version_id)
             values ($1, $2, $3)
             on conflict (question_id, locale) do update set current_version_id = excluded.current_version_id`,
            [questionId, locale, existing[0].id],
          );
          if (locale === "en") defaultVersionId = existing[0].id;
          continue;
        }

        const nextNumber = (
          await client.query<{ n: number }>(
            "select coalesce(max(version_number), 0) + 1 as n from content.question_versions where question_id = $1",
            [questionId],
          )
        ).rows[0].n;

        const { rows: versionRows } = await client.query<{ id: string }>(
          `insert into content.question_versions
             (question_id, version_number, topic_id, subtopic_id, tags, locale, difficulty,
              question_type, stem, statements, prompt, options, correct_option_id, explanation, content_hash)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15)
           returning id`,
          [
            questionId,
            nextNumber,
            topic,
            subtopic,
            question.tags ?? [],
            locale,
            question.difficulty ?? "medium",
            question.type ?? "mcq",
            text.stem ?? null,
            text.statements ?? [],
            text.prompt,
            JSON.stringify(text.options),
            question.correctOptionId,
            text.explanation ?? null,
            hash,
          ],
        );
        const versionId = versionRows[0].id;
        counts.versions += 1;

        await client.query(
          `insert into content.question_localizations (question_id, locale, current_version_id)
           values ($1, $2, $3)
           on conflict (question_id, locale) do update set current_version_id = excluded.current_version_id`,
          [questionId, locale, versionId],
        );
        if (locale === "en") defaultVersionId = versionId;
      }

      if (defaultVersionId) {
        await client.query("update content.questions set current_version_id = $1 where id = $2", [
          defaultVersionId,
          questionId,
        ]);
      }

      await client.query(
        `insert into content.paper_questions (paper_id, section_id, question_id, position)
         values ($1, $2, $3, $4)
         on conflict (paper_id, question_id) do update set position = excluded.position,
           section_id = excluded.section_id`,
        [paperId, sectionIds.get(question.section) ?? null, questionId, question.position],
      );
      counts.members += 1;
    }

    await client.query("commit");
    console.log(
      `done: ${counts.questions} questions, ${counts.versions} versions, ${counts.sections} sections, ${counts.members} paper slots`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
