-- Player-facing tables: profiles, admin roles, attempts, their questions and answers.
--
-- The browser reaches these through PostgREST, so RLS is on everywhere. Only the
-- rows a player owns are readable; every write path runs through the server, which
-- uses the secret key and re-checks ownership itself.

create type public.attempt_mode as enum ('classic', 'time_rush', 'practice', 'daily', 'survival');
create type public.attempt_status as enum ('ready', 'active', 'completed', 'expired', 'abandoned');
create type public.answer_action as enum ('answer', 'skip', 'reveal', 'timeout');
create type public.admin_role as enum ('editor', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(preferences) = 'object'),
  leaderboard_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public identity only. Email and password live in auth.users.';

-- Roles are granted by a trusted administrative process, never by the client.
create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.admin_role not null default 'editor',
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  mode public.attempt_mode not null,
  status public.attempt_status not null default 'ready',
  -- Frozen, validated setup: topics, difficulty, count/duration. Never re-read from the client.
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  rules_version integer not null default 1 check (rules_version > 0),
  selection_seed text not null,
  question_count integer not null check (question_count between 1 and 100),
  current_position integer not null default 0 check (current_position >= 0),
  score integer not null default 0 check (score >= 0),
  lives integer check (lives is null or lives >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  expires_at timestamptz,
  finished_at timestamptz,
  constraint attempts_active_is_started check (status <> 'active' or started_at is not null),
  constraint attempts_position_within_count check (current_position <= question_count)
);

create index attempts_owner_created_idx on public.attempts (owner_id, created_at desc);
create index attempts_status_idx on public.attempts (status);
create index attempts_open_ready_idx on public.attempts (created_at) where status = 'ready';

create table public.attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  position integer not null check (position > 0),
  question_id uuid not null references content.questions (id) on delete restrict,
  question_version_id uuid not null references content.question_versions (id) on delete restrict,
  -- Stable option ids in the order this attempt presents them.
  option_order jsonb not null check (jsonb_typeof(option_order) = 'array'
    and jsonb_array_length(option_order) = 4),
  presented_at timestamptz,
  unique (attempt_id, position),
  unique (attempt_id, question_version_id)
);

create index attempt_questions_attempt_idx on public.attempt_questions (attempt_id, position);

create table public.attempt_answers (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  attempt_question_id uuid not null references public.attempt_questions (id) on delete cascade,
  id uuid primary key default gen_random_uuid(),
  action public.answer_action not null,
  selected_option_id text,
  is_correct boolean not null default false,
  points_awarded integer not null default 0 check (points_awarded >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  accepted_at timestamptz not null default now(),
  -- At most one accepted action per question, enforced by the database.
  unique (attempt_question_id),
  -- A retried request with the same key returns the stored outcome.
  unique (attempt_id, idempotency_key),
  constraint attempt_answers_selected_option_required
    check (action <> 'answer' or selected_option_id is not null)
);

create index attempt_answers_attempt_idx on public.attempt_answers (attempt_id);

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_questions enable row level security;
alter table public.attempt_answers enable row level security;

-- A player reads and edits only their own profile.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- Own attempts are readable for history and resume; writes stay server-only.
create policy attempts_select_own on public.attempts
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- attempt_questions and attempt_answers have RLS on and no policy: the answer key
-- and per-question rows are never exposed to the browser. The server reads them
-- with the secret key and returns constructed responses.
-- admin_users likewise has no policy; roles are never client-writable.
