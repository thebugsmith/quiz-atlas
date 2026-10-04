-- Exam catalog: who issues an exam, which cycle (edition) it belongs to, which stage,
-- and which administration a paper is. One paper row is one sitting; a shift, a retest
-- or a separately administered subject paper is a different paper. Everything here is
-- additive: existing quiz content and `content.papers` rows keep working, and a paper
-- with no edition/stage is simply a legacy row.
--
-- The bank stays in the private `content` schema. Nothing below is reachable through
-- PostgREST; the server reads it with the secret key and returns constructed objects.

-- Who sets and conducts the exam. JEE Main and JEE Advanced share NTA but not rules,
-- so the exam row, not the authority, carries the rule identity.
create table if not exists content.exam_authorities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null default 'national_body'
    check (kind in ('national_body', 'state_commission', 'board', 'other')),
  created_at timestamptz not null default now()
);

alter table content.exams
  add column if not exists authority_id uuid references content.exam_authorities (id) on delete set null,
  add column if not exists code text,
  add constraint exams_code_format check (code is null or code ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

comment on column content.exams.code is
  'Stable machine identity (jee-main, cgpsc-state-service). Slug stays the URL identity.';

-- A cycle is a named edition of an exam, independent of the dates it was held on:
-- "JEE Main 2025" is one edition even when it ran in two sessions.
create table if not exists content.exam_editions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references content.exams (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 24),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  held_from date,
  held_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exam_id, code),
  constraint exam_editions_date_order check (held_to is null or held_from is null or held_to >= held_from)
);

create index if not exists exam_editions_by_exam on content.exam_editions (exam_id, code desc);

-- Prelims, Tier I, Paper 1. A stage only exists under one exam, so a stage can never
-- be reused across two rule sets.
create or replace function content.slug_code(value text)
returns boolean
language sql
immutable
as $$ select value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' $$;

create table if not exists content.exam_stages (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references content.exams (id) on delete cascade,
  code text not null check (content.slug_code(code)),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  position integer not null default 1 check (position > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (exam_id, code)
);

create index if not exists exam_stages_by_exam on content.exam_stages (exam_id, position);

-- Supported response kinds. A paper that contains a numerical section says so here,
-- and a paper that claims to be complete must list everything it actually asks for.
create or replace function content.exam_types_are_valid(kinds text[])
returns boolean
language sql
immutable
as $$
  select kinds is not null
    and array_length(kinds, 1) is not null
    and not exists (
      select 1 from unnest(kinds) as kind
      where kind not in ('single', 'multiple', 'numerical')
    )
    and (select count(distinct k) from unnest(kinds) as k) = array_length(kinds, 1);
$$;

alter table content.papers
  add column if not exists edition_id uuid references content.exam_editions (id) on delete restrict,
  add column if not exists stage_id uuid references content.exam_stages (id) on delete restrict,
  add column if not exists paper_code text,
  add column if not exists session_label text,
  add column if not exists administration text not null default 'regular',
  add column if not exists supported_types text[] not null default '{single}',
  add column if not exists question_count integer,
  add column if not exists max_marks numeric(7, 2),
  add column if not exists source_status text not null default 'synthetic',
  add column if not exists instructions jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table content.papers
  add constraint papers_administration_valid
    check (administration in ('regular', 'retest', 'cancelled')),
  add constraint papers_source_status_valid
    check (source_status in ('official_verified', 'reviewed_reconstruction', 'synthetic')),
  add constraint papers_supported_types_valid
    check (content.exam_types_are_valid(supported_types)),
  add constraint papers_counts_positive
    check ((question_count is null or question_count between 1 and 500)
       and (max_marks is null or max_marks > 0)),
  add constraint papers_stage_needs_edition
    check (stage_id is null or edition_id is not null),
  add constraint papers_instructions_object
    check (jsonb_typeof(instructions) = 'object');

comment on column content.papers.administration is
  'regular, retest or cancelled. A retest is a separate paper, never an edit of the original.';
comment on column content.papers.source_status is
  'official_verified: checked against the official paper. reviewed_reconstruction: rebuilt from evidence. synthetic: development fixture, never shown as a real paper.';

-- Administration identity: the same cycle, stage, paper, session, shift and
-- administration kind is one sitting. Two rows for it is a data error, whatever their
-- slugs. Legacy rows (no edition) are outside the identity rule.
create unique index if not exists papers_administration_identity_idx
  on content.papers (
    edition_id,
    stage_id,
    lower(btrim(coalesce(paper_code, ''))),
    lower(btrim(coalesce(session_label, ''))),
    lower(btrim(coalesce(shift_label, ''))),
    administration
  )
  where edition_id is not null;

create index if not exists papers_by_edition on content.papers (edition_id, year desc);
create index if not exists papers_by_stage on content.papers (stage_id);

create trigger papers_touch_updated_at
  before update on content.papers
  for each row execute function content.touch_updated_at();

-- Language coverage is an explicit claim per paper: a translation is "reviewed" only
-- after someone compared it with the official text. It is never implied by a locale row.
create table if not exists content.paper_locales (
  paper_id uuid not null references content.papers (id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'official')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  primary key (paper_id, locale),
  constraint paper_locales_review_stamped
    check (status = 'draft' or reviewed_at is not null)
);

-- Immutable content manifests. A published manifest is what an attempt pins; edits
-- append a new version, exactly like question versions.
create table if not exists content.paper_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references content.papers (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded')),
  question_count integer check (question_count is null or question_count > 0),
  max_marks numeric(7, 2) check (max_marks is null or max_marks > 0),
  locales text[] not null default '{}',
  instructions jsonb not null default '{}'::jsonb check (jsonb_typeof(instructions) = 'object'),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (paper_id, version_number),
  constraint paper_versions_published_stamped
    check (status = 'draft' or published_at is not null)
);

create index if not exists paper_versions_by_paper
  on content.paper_versions (paper_id, version_number desc);

-- Only the status may move on a published manifest (published -> superseded), so an
-- attempt that pinned it can never be shown different content.
create or replace function content.reject_published_paper_version_change()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'published' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'a published paper version cannot be deleted (%)', old.id
      using errcode = 'check_violation';
  end if;

  if new.status = 'superseded'
     and new.paper_id = old.paper_id
     and new.version_number = old.version_number
     and new.question_count is not distinct from old.question_count
     and new.max_marks is not distinct from old.max_marks
     and new.locales = old.locales
     and new.instructions = old.instructions
     and new.provenance = old.provenance
     and new.published_at = old.published_at then
    return new;
  end if;

  raise exception 'a published paper version is immutable (%)', old.id
    using errcode = 'check_violation';
end;
$$;

create trigger paper_versions_immutable
  before update or delete on content.paper_versions
  for each row execute function content.reject_published_paper_version_change();

-- Grading keys. The row here is only the identity and lifecycle of a key; the items
-- live in exam_key_items (added with the import contract). A key belongs to exactly one
-- paper, and the composite unique below is what makes a booklet from another paper
-- impossible to attach.
create table if not exists content.exam_key_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references content.papers (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded')),
  source_note text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (paper_id, version_number),
  unique (id, paper_id),
  constraint exam_key_versions_published_stamped
    check (status = 'draft' or published_at is not null)
);

create index if not exists exam_key_versions_by_paper
  on content.exam_key_versions (paper_id, version_number desc);

-- Printed booklets (form codes) of one paper. Each booklet can be graded with one key,
-- and that key has to be a key of the same paper; a key attached across papers is
-- rejected by the database, not by a runtime check.
create table if not exists content.paper_booklets (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references content.papers (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 8),
  option_label_style text not null default 'letters'
    check (option_label_style in ('letters', 'numbers', 'regional')),
  key_version_id uuid,
  created_at timestamptz not null default now(),
  unique (paper_id, code),
  unique (id, paper_id),
  constraint paper_booklets_key_same_paper
    foreign key (key_version_id, paper_id)
    references content.exam_key_versions (id, paper_id)
    on delete restrict
);

create index if not exists paper_booklets_by_paper on content.paper_booklets (paper_id);

-- Booklet-specific arrangement: which printed number carries which paper item, and
-- which option label sits on which canonical option. Only items already in the paper
-- can appear in its booklets.
create table if not exists content.paper_booklet_items (
  booklet_id uuid not null references content.paper_booklets (id) on delete cascade,
  paper_id uuid not null,
  question_id uuid not null,
  printed_number integer not null check (printed_number between 1 and 500),
  option_labels jsonb not null default '[]'::jsonb
    check (jsonb_typeof(option_labels) = 'array'),
  primary key (booklet_id, question_id),
  unique (booklet_id, printed_number),
  constraint paper_booklet_items_membership
    foreign key (paper_id, question_id)
    references content.paper_questions (paper_id, question_id)
    on delete cascade
);

-- Provenance. Every published paper should point at the document it was built from;
-- the hash makes "same file, different URL" recognisable and duplicate imports visible.
create table if not exists content.exam_sources (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid references content.exam_authorities (id) on delete set null,
  paper_id uuid references content.papers (id) on delete set null,
  kind text not null default 'official_paper'
    check (kind in ('official_paper', 'official_key', 'notice', 'syllabus', 'other')),
  url text check (url is null or url ~ '^https?://'),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  pages integer check (pages is null or pages > 0),
  retrieved_at timestamptz not null default now(),
  rights_note text,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now(),
  constraint exam_sources_identified check (url is not null or sha256 is not null)
);

create unique index if not exists exam_sources_sha256_idx
  on content.exam_sources (sha256) where sha256 is not null;
create index if not exists exam_sources_by_paper on content.exam_sources (paper_id);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on
      content.exam_authorities,
      content.exam_editions,
      content.exam_stages,
      content.paper_locales,
      content.paper_versions,
      content.exam_key_versions,
      content.paper_booklets,
      content.paper_booklet_items,
      content.exam_sources
    to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on
      content.exam_authorities,
      content.exam_editions,
      content.exam_stages,
      content.paper_locales,
      content.paper_versions,
      content.exam_key_versions,
      content.paper_booklets,
      content.paper_booklet_items,
      content.exam_sources
    from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on
      content.exam_authorities,
      content.exam_editions,
      content.exam_stages,
      content.paper_locales,
      content.paper_versions,
      content.exam_key_versions,
      content.paper_booklets,
      content.paper_booklet_items,
      content.exam_sources
    from authenticated;
  end if;
end
$$;
