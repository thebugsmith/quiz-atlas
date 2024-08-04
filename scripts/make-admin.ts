/**
 * Trusted bootstrap for the first administrator.
 *
 *   pnpm admin:grant --email you@example.com [--role admin]
 *   pnpm admin:grant --user <uuid> --role editor
 *
 * Run by someone holding the database credentials; never exposed as an endpoint.
 * Idempotent: re-running the same grant leaves the role as asked.
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
  const valueOf = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const email = valueOf("--email");
  const userId = valueOf("--user");
  const role = valueOf("--role") ?? "admin";

  if (!email && !userId) {
    console.error("Usage: pnpm admin:grant --email <address> [--role admin|editor]");
    console.error("       pnpm admin:grant --user <uuid> [--role admin|editor]");
    process.exit(2);
  }

  if (role !== "admin" && role !== "editor") {
    console.error("--role must be admin or editor");
    process.exit(2);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });

  try {
    const { rows } = email
      ? await pool.query<{ id: string; email: string | null }>(
          "select id, email from auth.users where email = $1",
          [email],
        )
      : await pool.query<{ id: string; email: string | null }>(
          "select id, email from auth.users where id = $1",
          [userId],
        );

    const user = rows[0];
    if (!user) {
      console.error(
        `No account found for ${email ?? userId}. Create it through the sign-up screen first.`,
      );
      process.exitCode = 1;
      return;
    }

    await pool.query(
      `insert into public.admin_users (user_id, role)
       values ($1, $2::public.admin_role)
       on conflict (user_id) do update set role = excluded.role`,
      [user.id, role],
    );

    console.log(`${user.email ?? user.id} is now ${role}.`);
  } finally {
    await pool.end();
  }
}

void main();
