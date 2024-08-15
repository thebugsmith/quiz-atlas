/**
 * Inventory and editorial report for the question bank.
 *
 *   pnpm content:report            # summary to the terminal
 *   pnpm content:report --json     # machine-readable, for a build log
 *
 * Reads the private `content` schema directly (DATABASE_URL). It reports what is
 * there; it never creates, edits or "fixes" content — a shortfall has to be visible,
 * not papered over.
 */
import { resolve } from "node:path";
import { Pool } from "pg";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

type Row = Record<string, string | number | null>;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL must be set in .env.local (the local stack prints it as DB_URL)");
    process.exit(2);
  }

  const json = process.argv.includes("--json");
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const topics = (
      await pool.query<Row>(`
        select t.slug,
               t.name,
               t.is_active,
               count(q.id) filter (where q.archived_at is null and q.current_version_id is not null) as live,
               count(q.id) filter (where q.archived_at is not null) as archived,
               count(q.id) filter (
                 where q.archived_at is null
                   and (q.current_version_id is null or exists (
                     select 1 from content.question_versions dv
                      join content.question_versions cv on cv.id = q.current_version_id
                     where dv.question_id = q.id and dv.version_number > cv.version_number
                   ))
               ) as drafts,
               count(q.id) filter (where q.archived_at is null and q.current_version_id is not null
                                     and v.difficulty = 'easy') as easy,
               count(q.id) filter (where q.archived_at is null and q.current_version_id is not null
                                     and v.difficulty = 'medium') as medium,
               count(q.id) filter (where q.archived_at is null and q.current_version_id is not null
                                     and v.difficulty = 'hard') as hard,
               count(q.id) filter (where q.archived_at is null and q.current_version_id is not null
                                     and coalesce(v.explanation, '') = '') as missing_explanation
          from content.topics t
          left join content.question_versions v on v.topic_id = t.id
          left join content.questions q on q.id = v.question_id
         group by t.slug, t.name, t.is_active
         order by live desc, t.name`)
    ).rows;

    const totals = (
      await pool.query<Row>(`
        select count(*) filter (where q.archived_at is null and q.current_version_id is not null) as live,
               count(*) filter (where q.archived_at is null and q.current_version_id is null) as never_published,
               count(*) filter (where q.archived_at is not null) as archived,
               count(distinct v.content_hash) filter (where q.archived_at is null and q.current_version_id is not null) as unique_bodies,
               count(*) filter (where q.archived_at is null and q.current_version_id is not null
                                and coalesce(v.explanation, '') = '') as missing_explanation
          from content.questions q
          left join content.question_versions v on v.id = q.current_version_id`)
    ).rows[0];

    const duplicates = (
      await pool.query<Row>(`
        select left(v.content_hash, 12) as hash, count(*) as copies,
               string_agg(q.external_id, ', ' order by q.external_id) as external_ids
          from content.questions q
          join content.question_versions v on v.id = q.current_version_id
         where q.archived_at is null
         group by v.content_hash
        having count(*) > 1
         order by count(*) desc, hash
         limit 20`)
    ).rows;

    const drafts = (
      await pool.query<Row>(`
        select q.external_id, t.name as topic, v.version_number, q.updated_at::date::text as updated
          from content.questions q
          join content.question_versions v on v.question_id = q.id
          join content.topics t on t.id = v.topic_id
         where q.archived_at is null
           and (q.current_version_id is null
                or v.version_number > (select version_number from content.question_versions where id = q.current_version_id))
           and v.version_number = (select max(version_number) from content.question_versions where question_id = q.id)
         order by q.external_id
         limit 100`)
    ).rows;

    if (json) {
      console.log(JSON.stringify({ topics, totals, duplicates, drafts }, null, 2));
      return;
    }

    const pad = (value: string | number | null, width: number) =>
      String(value ?? "0").padStart(width);
    console.log("Topic            live  draft  arch   easy  medium   hard  no-expl");
    for (const row of topics) {
      console.log(
        `${String(row.name).padEnd(15).slice(0, 15)}${pad(row.live, 6)}${pad(row.drafts, 7)}${pad(row.archived, 6)}` +
          `${pad(row.easy, 7)}${pad(row.medium, 8)}${pad(row.hard, 7)}${pad(row.missing_explanation, 9)}`,
      );
    }

    console.log(
      `\nLive ${totals.live} · unique bodies ${totals.unique_bodies} · never published ${totals.never_published} · ` +
        `archived ${totals.archived} · without explanation ${totals.missing_explanation}`,
    );

    const thin = topics.filter((row) => Number(row.live) < 5).map((row) => row.slug);
    console.log(
      `Topics below the five-question floor: ${thin.length === 0 ? "none" : thin.join(", ")}`,
    );

    if (duplicates.length > 0) {
      console.log("\nDuplicate live bodies:");
      for (const row of duplicates)
        console.log(`  ${row.hash} × ${row.copies} — ${row.external_ids}`);
    } else {
      console.log("\nDuplicate live bodies: none");
    }

    console.log(`\nUnpublished drafts: ${drafts.length}`);
    for (const row of drafts)
      console.log(`  ${row.external_id} (${row.topic}, v${row.version_number})`);
  } finally {
    await pool.end();
  }
}

void main();
