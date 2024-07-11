-- Core question bank.
--
-- Everything in the `content` schema is private: it is deliberately absent from
-- `api.schemas` in config.toml, so PostgREST has no route to these tables and the
-- browser roles (anon/authenticated) are granted no privileges on them. Only the
-- server-side client, which uses the secret key, reads question versions and
-- answer keys; it returns explicitly constructed public objects.

create schema if not exists content;

revoke all on schema content from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema content from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema content from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema content to service_role;
  end if;
end
$$;

create type content.difficulty as enum ('easy', 'medium', 'hard');
create type content.question_status as enum ('draft', 'published', 'archived');

create table content.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '',
  icon_key text not null default 'book-open',
  display_color text not null default 'blue',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table content.topics is 'Launch topics are data, not code: adding Arts or Nature needs no deploy.';

create table content.subtopics (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references content.topics (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (topic_id, slug)
);

create index subtopics_topic_id_idx on content.subtopics (topic_id);

create table content.questions (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique check (char_length(external_id) between 3 and 120),
  status content.question_status not null default 'draft',
  -- Pointer to the version players receive. Added below, after question_versions exists.
  current_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint questions_published_has_version
    check (status <> 'published' or current_version_id is not null),
  constraint questions_archived_has_timestamp
    check (status <> 'archived' or archived_at is not null)
);

create index questions_status_idx on content.questions (status);

-- Four distinct option ids, four distinct normalised option texts, and a correct
-- id that belongs to the array. Array position never identifies the answer.
create function content.options_are_valid(options jsonb, correct_option_id text)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof($1) = 'array'
    and jsonb_array_length($1) = 4
    and (select count(distinct option ->> 'id') from jsonb_array_elements($1) as option) = 4
    and (
      select count(distinct lower(btrim(regexp_replace(option ->> 'text', '\s+', ' ', 'g'))))
      from jsonb_array_elements($1) as option
    ) = 4
    and not exists (
      select 1
      from jsonb_array_elements($1) as option
      where coalesce(btrim(option ->> 'id'), '') = ''
        or coalesce(btrim(option ->> 'text'), '') = ''
    )
    and exists (
      select 1
      from jsonb_array_elements($1) as option
      where option ->> 'id' = $2
    );
$$;

create table content.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references content.questions (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  topic_id uuid not null references content.topics (id) on delete restrict,
  subtopic_id uuid references content.subtopics (id) on delete restrict,
  tags text[] not null default '{}',
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  difficulty content.difficulty not null,
  prompt text not null check (char_length(btrim(prompt)) between 5 and 1000),
  options jsonb not null,
  correct_option_id text not null,
  explanation text not null check (char_length(btrim(explanation)) between 5 and 2000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  license_note text not null default '',
  attribution text,
  verified_at date,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  author_id uuid references auth.users (id) on delete set null,
  reviewer_id uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (question_id, version_number),
  constraint question_versions_options_valid
    check (content.options_are_valid(options, correct_option_id))
);

create index question_versions_selection_idx
  on content.question_versions (topic_id, difficulty, locale);
create index question_versions_question_idx on content.question_versions (question_id, version_number desc);
create index question_versions_tags_idx on content.question_versions using gin (tags);

alter table content.questions
  add constraint questions_current_version_fk
  foreign key (current_version_id) references content.question_versions (id) on delete restrict;

-- Published versions are immutable: an edit becomes a new version, and attempts
-- made against the old one keep pointing at content that never changes.
create function content.reject_published_version_change()
returns trigger
language plpgsql
as $$
begin
  if old.published_at is not null then
    raise exception 'published question versions are immutable (version %)', old.id
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger question_versions_immutable
  before update or delete on content.question_versions
  for each row execute function content.reject_published_version_change();

create function content.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger topics_touch_updated_at
  before update on content.topics
  for each row execute function content.touch_updated_at();

create trigger questions_touch_updated_at
  before update on content.questions
  for each row execute function content.touch_updated_at();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on all tables in schema content to service_role;
    grant execute on all functions in schema content to service_role;
  end if;
end
$$;
