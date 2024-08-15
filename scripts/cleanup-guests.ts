/**
 * Removes anonymous identities that never played anything.
 *
 *   pnpm guests:cleanup                 # older than 30 days
 *   pnpm guests:cleanup --days 7
 *
 * Guests with attempts, bookmarks or reports are kept: those rows are someone's only
 * record of a quiz. Every run writes an audit row with the number deleted.
 */
import { resolve } from "node:path";
import { Pool } from "pg";

process.loadEnvFile(resolve(process.cwd(), ".env.local"));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL must be set in .env.local (the local stack prints it as DB_URL)");
    process.exit(2);
  }

  const args = process.argv.slice(2);
  const daysArg = args.indexOf("--days");
  const days = daysArg >= 0 ? Math.max(1, Number(args[daysArg + 1]) || 30) : 30;

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const { rows } = await pool.query<{ result: { deleted: number; older_than: string } }>(
      "select public.admin_cleanup_guests(make_interval(days => $1)) as result",
      [days],
    );
    const result = rows[0]?.result;
    console.log(`Deleted ${result?.deleted ?? 0} unused guest identities older than ${days} days.`);
  } finally {
    await pool.end();
  }
}

void main();
