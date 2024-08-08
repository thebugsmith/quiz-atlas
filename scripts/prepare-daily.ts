/**
 * Pre-creates daily challenges so a midnight crossing never has to build a set while
 * a player is waiting.
 *
 *   pnpm daily:prepare            # today + the next 2 days
 *   pnpm daily:prepare --days 7
 *
 * Safe to run as often as you like: `game_ensure_daily_challenge` is idempotent and
 * takes an advisory lock, so a cron entry and a player's first request can race without
 * producing two sets for the same date.
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
  const days = daysArg >= 0 ? Math.min(Math.max(Number(args[daysArg + 1]) || 3, 1), 30) : 3;

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });

  try {
    for (let offset = 0; offset < days; offset += 1) {
      const { rows } = await pool.query<{ date: string; id: string; count: string }>(
        `select c.challenge_date::text as date, c.id::text as id, c.question_count::text as count
           from public.game_ensure_daily_challenge((now() at time zone 'utc')::date + $1::int) c`,
        [offset],
      );
      const row = rows[0];
      console.log(`${row.date}: ${row.count} questions (${row.id})`);
    }
  } finally {
    await pool.end();
  }
}

void main();
