# Quiz Atlas

A quiz game for competitive-exam practice. Pick a topic and play

## What it does

- **Five formats** - Classic (fixed set, calm pace), Time Rush (a countdown per question),
  Practice (untimed, explanations first), Survival (lives, ends when they run out) and Daily
  (one shared set per UTC day, one ranked attempt per player).
- **Papers** - a question can belong to an exam paper, with year, shift and subject section
  recorded relationally, so "all 2025 NEET botany questions" is a query rather than a tag.
- **Accounts** - Google sign-in, and guests who can play immediately and keep their attempts
  when they sign in.
- **Progress** - accuracy per topic, streaks, personal bests, bookmarks and missed-question
  practice.
- **Admin** - question editor with versioning, topic management, bulk JSON import, report
  triage.

## Stack

|         |                                                                            |
| ------- | -------------------------------------------------------------------------- |
| App     | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4             |
| Data    | Supabase: Postgres, Auth, Storage                                          |
| Hosting | Next.js standalone output on a small Linux box, database on Supabase Cloud |
| Tooling | pnpm 12, ESLint, Prettier, Playwright                                      |

## How the data is shaped

The bank lives in the private `content` schema and is deliberately not exposed through
PostgREST. Three ideas carry most of the design:

- **Versions are immutable.** Editing a question appends a version and moves
  `current_version_id`; the old row stays. Attempts point at the exact version that was
  served, so a result screen always shows what the player actually saw.
- **Mixing is server-side.** The browser sends intent - mode, topics, count - and the server
  decides which questions exist, in what order, and whether there is enough inventory.
- **Answer keys never reach the client** until the server scores the answer.

## Running it locally

Requirements: Node 22.12+, pnpm 12, Docker (for the local Supabase stack).

```bash
pnpm install
pnpm db:start          # local Postgres + Auth on 54321/54322
pnpm db:types          # regenerate src/lib/supabase/database.types.ts
cp .env.example .env.local   # then fill in the values printed by `pnpm db:status`
pnpm dev
```

Environment variables:

| Variable                               | Purpose                                       |
| -------------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key                        |
| `SUPABASE_SECRET_KEY`                  | Server-only key; never exposed to the browser |
| `NEXT_PUBLIC_SITE_URL`                 | Absolute URL used for auth redirects          |
| `DATABASE_URL`                         | Direct Postgres connection for scripts        |

## Scripts

```bash
pnpm dev              # development server
pnpm build            # production build (standalone)
pnpm start            # run the production build
pnpm lint             # eslint
pnpm typecheck        # next typegen + tsc --noEmit
pnpm format           # prettier --write .
pnpm test:e2e         # playwright journeys

pnpm db:start         # local supabase up/down/status/reset
pnpm db:stop
pnpm db:types
pnpm db:snapshot      # pg_dump content + public to ~/db-snapshots (keeps 20)

pnpm content:import --file data/questions/<file>.json [--dry-run]
pnpm paper:import   --file data/papers/<paper>.json [--dry-run]
pnpm content:report   # per-topic live counts
pnpm content:wipe --yes   # destructive: empties the bank, keeps the taxonomy
pnpm daily:prepare --days 1
pnpm admin:grant --email <address>
pnpm guests:cleanup
```

Importing is idempotent: re-running the same file does not create duplicate versions. Take a
snapshot before a bulk change - the bank has no undo button.

## Deploying

```bash
pnpm build
# copy .next/static and public into .next/standalone, then run server.js with the env file
node .next/standalone/server.js
```

Migrations are applied with `supabase db push`. The app reads its secrets at runtime, so the
same build artifact can be promoted between environments.

Health check: `GET /api/health` reports database reachability, live question count and
whether today's daily set is prepared - no personal data, safe to poll.

## Testing

```bash
pnpm test:e2e
```

The journeys cover the guest path, a full Classic round, the answer-key boundary (a player
never receives the key before scoring), cross-origin writes being refused, and the health
payload.

## Question authoring

Authoring rules - schema, bilingual fields, taxonomy, math conventions, diagrams - live with
the project notes rather than in this repository, because they describe the private bank.
The short version: four options with stable ids, `correct_option_id` pointing at one of them,
topics from the database taxonomy, and no scraped provenance recorded anywhere.

## License

MIT - see [LICENSE](LICENSE).
