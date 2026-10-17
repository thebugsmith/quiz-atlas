/**
 * Exam paper importer: catalog identity, typed items, ordered manifest, rules and key.
 *
 *   pnpm exam:import --file data/exam-papers/<paper>.json [--dry-run]
 *
 * The manifest names a key file beside it. The key is read here, on the server, and
 * written straight to the private `content` schema; it is never copied into the
 * manifest, a log line or a response.
 *
 * Re-running an import is safe: items are keyed by external id, item versions by their
 * content hash, and a paper with attempts on it is refused rather than rewritten.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  keyProblems,
  manifest as manifestSchema,
  privateKey as keySchema,
  type Manifest,
  type PrivateKey,
} from "../src/features/exam/import-schema";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

/** sha256 over key-sorted JSON: identical content keeps its version row. */
function fingerprint(value: unknown): string {
  const stable = (input: unknown): string => {
    if (Array.isArray(input)) return `[${input.map(stable).join(",")}]`;
    if (input && typeof input === "object") {
      return `{${Object.keys(input as Record<string, unknown>)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stable((input as Record<string, unknown>)[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(input ?? null);
  };
  return createHash("sha256").update(stable(value)).digest("hex");
}

/** "4", "-1", "-2/3" to the two-decimal column value a paper card shows. */
function decimal(rational: string): number {
  const [numerator, denominator] = rational.split("/").map(Number);
  return (
    Math.round(((denominator ? numerator / denominator : numerator) + Number.EPSILON) * 100) / 100
  );
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function upsertAuthority(client: PoolClient, manifest: Manifest) {
  if (!manifest.exam.authority) return null;
  const { rows } = await client.query<{ id: string }>(
    `insert into content.exam_authorities (slug, name, kind)
     values ($1, $2, $3)
     on conflict (slug) do update set name = excluded.name, kind = excluded.kind
     returning id`,
    [manifest.exam.authority.slug, manifest.exam.authority.name, manifest.exam.authority.kind],
  );
  return rows[0].id;
}

async function write(client: PoolClient, paper: Manifest, key: PrivateKey) {
  const authorityId = await upsertAuthority(client, paper);

  const { rows: examRows } = await client.query<{ id: string }>(
    `insert into content.exams (slug, name, description, family, authority_id, code)
     values ($1, $2, coalesce($3, ''), $4, $5, $1)
     on conflict (slug) do update set
       name = excluded.name,
       family = excluded.family,
       authority_id = coalesce(excluded.authority_id, content.exams.authority_id),
       code = coalesce(content.exams.code, excluded.code)
     returning id`,
    [paper.exam.slug, paper.exam.name, null, paper.exam.family ?? null, authorityId],
  );
  const examId = examRows[0].id;

  const { rows: editionRows } = await client.query<{ id: string }>(
    `insert into content.exam_editions (exam_id, code, label, held_from, held_to)
     values ($1, $2, $3, $4, $5)
     on conflict (exam_id, code) do update set
       label = excluded.label, held_from = excluded.held_from, held_to = excluded.held_to
     returning id`,
    [
      examId,
      paper.edition.code,
      paper.edition.label,
      paper.edition.held_from ?? null,
      paper.edition.held_to ?? null,
    ],
  );
  const editionId = editionRows[0].id;

  const { rows: stageRows } = await client.query<{ id: string }>(
    `insert into content.exam_stages (exam_id, code, name, position)
     values ($1, $2, $3, $4)
     on conflict (exam_id, code) do update set name = excluded.name, position = excluded.position
     returning id`,
    [examId, paper.stage.code, paper.stage.name, paper.stage.position ?? 1],
  );
  const stageId = stageRows[0].id;

  const { rows: paperRows } = await client.query<{ id: string }>(
    `insert into content.papers
       (exam_id, slug, year, paper_label, shift_label, duration_seconds, marks_correct,
        marks_wrong, status, published_at, edition_id, stage_id, paper_code, session_label,
        administration, supported_types, question_count, source_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::text[], $17, $18)
     on conflict (slug) do update set
       exam_id = excluded.exam_id,
       year = excluded.year,
       paper_label = excluded.paper_label,
       shift_label = excluded.shift_label,
       duration_seconds = excluded.duration_seconds,
       marks_correct = excluded.marks_correct,
       marks_wrong = excluded.marks_wrong,
       status = excluded.status,
       published_at = excluded.published_at,
       edition_id = excluded.edition_id,
       stage_id = excluded.stage_id,
       paper_code = excluded.paper_code,
       session_label = excluded.session_label,
       administration = excluded.administration,
       supported_types = excluded.supported_types,
       question_count = excluded.question_count,
       source_status = excluded.source_status
     returning id`,
    [
      examId,
      paper.paper.slug,
      paper.paper.year,
      paper.paper.paper_label ?? null,
      paper.paper.shift_label ?? null,
      paper.paper.duration_seconds ?? null,
      Number(decimal(paper.rule.marking.correct)),
      Number(decimal(paper.rule.marking.incorrect)),
      paper.paper.status,
      paper.paper.status === "published" ? new Date() : null,
      editionId,
      stageId,
      paper.paper.paper_code ?? null,
      paper.paper.session_label ?? null,
      paper.paper.administration,
      paper.paper.supported_types,
      paper.items.length,
      paper.paper.source_status,
    ],
  );
  const paperId = paperRows[0].id;

  const attempts = await client.query<{ n: string }>(
    "select count(*)::text as n from public.attempts where paper_id = $1",
    [paperId],
  );
  if (attempts.rows[0].n !== "0") {
    throw new Error(`paper ${paper.paper.slug} already has attempts; refusing to rewrite it`);
  }

  const sectionIds = new Map<string, string>();
  for (const [index, entry] of paper.sections.entries()) {
    const { rows } = await client.query<{ id: string }>(
      `insert into content.paper_sections (paper_id, subject, position)
       values ($1, $2, $3)
       on conflict (paper_id, subject) do update set position = excluded.position
       returning id`,
      [paperId, entry.title, entry.position ?? index + 1],
    );
    sectionIds.set(entry.id, rows[0].id);
  }

  const stimulusIds = new Map<string, string>();
  for (const entry of paper.stimuli ?? []) {
    const { rows: stimulusRows } = await client.query<{ id: string }>(
      `insert into content.exam_stimuli (external_id, kind) values ($1, $2)
       on conflict (external_id) do update set kind = excluded.kind
       returning id`,
      [entry.id, entry.kind],
    );
    const stimulusId = stimulusRows[0].id;
    const body = { locale: "en", text: entry.text, media_path: entry.media_path ?? null };
    const hash = fingerprint(body);

    const { rows: existingStimulus } = await client.query<{ id: string; content_hash: string }>(
      `select id, content_hash from content.exam_stimulus_versions
        where stimulus_id = $1 and locale = 'en' order by version_number desc limit 1`,
      [stimulusId],
    );
    let stimulusVersionId =
      existingStimulus[0]?.content_hash === hash ? existingStimulus[0].id : null;
    if (!stimulusVersionId) {
      const { rows: next } = await client.query<{ n: number }>(
        `select coalesce(max(version_number), 0) + 1 as n from content.exam_stimulus_versions
          where stimulus_id = $1`,
        [stimulusId],
      );
      const { rows: inserted } = await client.query<{ id: string }>(
        `insert into content.exam_stimulus_versions
           (stimulus_id, version_number, locale, body, media_path, content_hash)
         values ($1, $2, 'en', $3, $4, $5)
         returning id`,
        [stimulusId, next[0].n, entry.text, entry.media_path ?? null, hash],
      );
      stimulusVersionId = inserted[0].id;
    }
    await client.query(
      `insert into content.exam_stimulus_localizations (stimulus_id, locale, current_version_id)
       values ($1, 'en', $2)
       on conflict (stimulus_id, locale) do update set current_version_id = excluded.current_version_id`,
      [stimulusId, stimulusVersionId],
    );
    stimulusIds.set(entry.id, stimulusId);
  }

  const versionIds = new Map<string, string>();
  for (const item of paper.items) {
    const { rows: itemRows } = await client.query<{ id: string }>(
      `insert into content.exam_items (external_id) values ($1)
       on conflict (external_id) do update set updated_at = now()
       returning id`,
      [item.item_id],
    );
    const itemId = itemRows[0].id;

    const body = {
      locale: "en",
      item_type: item.type,
      prompt: item.prompt,
      options: item.options ?? [],
      input_policy: item.input ?? null,
      explanation: item.explanation ?? null,
      statements: item.statements ?? [],
      stimulus_id: item.stimulus ? (stimulusIds.get(item.stimulus) ?? null) : null,
    };
    const hash = fingerprint(body);

    const { rows: existing } = await client.query<{ id: string; content_hash: string }>(
      `select id, content_hash from content.exam_item_versions
        where item_id = $1 and locale = 'en' order by version_number desc limit 1`,
      [itemId],
    );

    let versionId = existing[0]?.content_hash === hash ? existing[0].id : null;
    if (!versionId) {
      const { rows: next } = await client.query<{ n: number }>(
        `select coalesce(max(version_number), 0) + 1 as n from content.exam_item_versions
          where item_id = $1`,
        [itemId],
      );
      const { rows: inserted } = await client.query<{ id: string }>(
        `insert into content.exam_item_versions
           (item_id, version_number, locale, item_type, prompt, options, input_policy,
            explanation, statements, stimulus_id, content_hash)
         values ($1, $2, 'en', $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)
         returning id`,
        [
          itemId,
          next[0].n,
          item.type,
          item.prompt,
          JSON.stringify(item.options ?? []),
          item.input ? JSON.stringify(item.input) : null,
          item.explanation ?? null,
          item.statements ?? [],
          body.stimulus_id,
          hash,
        ],
      );
      versionId = inserted[0].id;
    }

    versionIds.set(item.item_id, versionId);

    await client.query(
      `insert into content.exam_item_localizations (item_id, locale, current_version_id)
       values ($1, 'en', $2)
       on conflict (item_id, locale) do update set current_version_id = excluded.current_version_id`,
      [itemId, versionId],
    );
  }

  await client.query("delete from content.exam_paper_items where paper_id = $1", [paperId]);
  for (const [index, item] of paper.items.entries()) {
    await client.query(
      `insert into content.exam_paper_items
         (paper_id, item_version_id, section_id, position, marking)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        paperId,
        versionIds.get(item.item_id),
        sectionIds.get(item.section) ?? null,
        index + 1,
        item.marking ? JSON.stringify(item.marking) : null,
      ],
    );
  }

  const ruleHash = fingerprint(paper.rule);
  const { rows: latestRule } = await client.query<{ id: string; content_hash: string | null }>(
    `select id, content_hash from content.exam_rule_versions
      where paper_id = $1 order by version_number desc limit 1`,
    [paperId],
  );
  const ruleBody = {
    timing: paper.rule.timing,
    marking: paper.rule.marking,
    navigation: paper.rule.navigation,
    choices: paper.rule.choices ?? {},
    display: paper.rule.display,
  };

  let ruleId = latestRule[0]?.content_hash === ruleHash ? latestRule[0].id : null;
  if (!ruleId) {
    const { rows: next } = await client.query<{ n: number }>(
      "select coalesce(max(version_number), 0) + 1 as n from content.exam_rule_versions where paper_id = $1",
      [paperId],
    );
    const { rows: inserted } = await client.query<{ id: string }>(
      `insert into content.exam_rule_versions
         (paper_id, version_number, status, timing, marking, navigation, choices, display,
          published_at, content_hash)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10)
       returning id`,
      [
        paperId,
        next[0].n,
        paper.paper.status === "published" ? "published" : "draft",
        JSON.stringify(ruleBody.timing),
        JSON.stringify(ruleBody.marking),
        JSON.stringify(ruleBody.navigation),
        JSON.stringify(ruleBody.choices),
        JSON.stringify(ruleBody.display),
        paper.paper.status === "published" ? new Date() : null,
        ruleHash,
      ],
    );
    ruleId = inserted[0].id;
  }

  const keyHash = fingerprint(key.items);
  const { rows: keyRows } = await client.query<{ id: string; content_hash: string | null }>(
    `insert into content.exam_key_versions
       (paper_id, version_number, status, source_note, published_at, content_hash)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (paper_id, version_number) do update set
       status = excluded.status, content_hash = excluded.content_hash
     returning id, content_hash`,
    [
      paperId,
      key.key_version,
      paper.paper.status === "published" ? "published" : "draft",
      paper.paper.source_status,
      paper.paper.status === "published" ? new Date() : null,
      keyHash,
    ],
  );
  const keyVersionId = keyRows[0].id;

  await client.query("delete from content.exam_key_items where key_version_id = $1", [
    keyVersionId,
  ]);
  for (const [itemId, entry] of Object.entries(key.items)) {
    await client.query(
      `insert into content.exam_key_items
         (paper_id, key_version_id, item_version_id, accepted_option_ids, correct_option_ids,
          accepted_numeric_intervals, exceptional_policy)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        paperId,
        keyVersionId,
        versionIds.get(itemId),
        entry.accepted_option_ids ?? null,
        entry.correct_option_ids ?? null,
        entry.accepted_numeric_intervals ? JSON.stringify(entry.accepted_numeric_intervals) : null,
        entry.exceptional_policy ?? null,
      ],
    );
  }

  if (paper.source && (paper.source.url || paper.source.sha256)) {
    await client.query(
      `insert into content.exam_sources
         (paper_id, kind, url, sha256, pages, retrieved_at, rights_note, review_status)
       values ($1, $2, $3, $4, $5, coalesce($6, now()), $7, $8)
       on conflict (sha256) where sha256 is not null do nothing`,
      [
        paperId,
        paper.source.kind,
        paper.source.url ?? null,
        paper.source.sha256 ?? null,
        paper.source.pages ?? null,
        paper.source.retrieved_at ?? null,
        paper.source.rights_note ?? null,
        paper.source.review_status,
      ],
    );
  }

  return {
    paperId,
    ruleId,
    keyVersionId,
    items: paper.items.length,
    sections: paper.sections.length,
  };
}

async function main() {
  const fileArg = process.argv.indexOf("--file");
  if (fileArg === -1) {
    console.error("Usage: pnpm exam:import --file data/exam-papers/<paper>.json [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const file = process.argv[fileArg + 1];
  const dryRun = process.argv.includes("--dry-run");
  const raw = readJson(file);

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`✗ ${file}`);
    for (const issue of parsed.error.issues.slice(0, 20)) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }
  const paper = parsed.data;

  const keyPath = resolve(dirname(resolve(file)), paper.private_key_file);
  const parsedKey = keySchema.safeParse(readJson(keyPath));
  if (!parsedKey.success) {
    console.error(`✗ ${keyPath}`);
    for (const issue of parsedKey.error.issues.slice(0, 20)) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }
  const key = parsedKey.data;

  const problems = keyProblems(paper, key);
  console.log(
    `${paper.paper.slug}: ${paper.items.length} items, ${paper.sections.length} sections, ` +
      `${Object.keys(key.items).length} key entries, ${problems.length} problems`,
  );
  for (const problem of problems.slice(0, 20))
    console.log(`  ✗ ${problem.path}: ${problem.message}`);
  if (problems.length > 0) {
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    console.log("dry run: nothing written");
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await write(client, paper, key);
    await client.query("commit");
    console.log(
      `done: paper ${result.paperId}, ${result.items} items in ${result.sections} sections, ` +
        `rule ${result.ruleId}, key ${result.keyVersionId}`,
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
