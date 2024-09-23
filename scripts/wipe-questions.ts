/**
 * Empties the question bank and everything that depends on it.
 *
 *   pnpm content:wipe --yes
 *
 * Destructive by design and refused without --yes. Topics and subtopics are kept: the
 * taxonomy is the frame the new bank hangs on. Player attempts, bookmarks, reports and
 * daily challenges go with the questions, because none of them mean anything without
 * the questions they point at.
 */
import { resolve } from "node:path";
import { Pool } from "pg";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

const steps: Array<[string, string]> = [
  ["question reports", "delete from public.question_reports"],
  ["daily challenges", "delete from public.daily_challenges"],
  ["attempts", "delete from public.attempts"],
  ["bookmarks", "delete from public.bookmarks"],
  ["current version pointers", "update content.questions set current_version_id = null"],
  ["question versions", "delete from content.question_versions"],
  ["questions", "delete from content.questions"],
];

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes every question and all player attempts. Re-run with --yes.");
    process.exitCode = 1;
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [label, sql] of steps) {
      const result = await client.query(sql);
      console.log(`${label}: ${result.rowCount ?? 0}`);
    }
    await client.query("commit");
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
