-- Past-paper exams: exams, papers, sections, ordered membership, per-locale versions,
-- and media. A question stays one row; its text exists once per language; a paper is
-- a sitting (year + date + shift), with sections for the subject split.

create table if not exists content.media (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  mime text not null default 'image/webp',
  width integer,
  height integer,
  sha256 text not null unique,
  alt_en text,
  alt_hi text,
  created_at timestamptz not null default now()
);

-- Which version of a question is live, per language. `questions.current_version_id`
-- remains the default-locale pointer so existing game functions keep working.
create table if not exists content.question_localizations (
  question_id uuid not null references content.questions(id) on delete cascade,
  locale text not null check (char_length(locale) between 2 and 8),
  current_version_id uuid not null references content.question_versions(id),
  primary key (question_id, locale)
);

create table if not exists content.exams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  family text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists content.papers (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references content.exams(id) on delete cascade,
  slug text not null unique,
  year integer not null,
  exam_date date,
  shift_label text,
  paper_label text,
  duration_seconds integer,
  marks_correct numeric(6, 2) not null default 1,
  marks_wrong numeric(6, 2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists content.paper_sections (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references content.papers(id) on delete cascade,
  subject text not null,
  topic_id uuid references content.topics(id),
  position integer not null default 1,
  unique (paper_id, subject)
);

create table if not exists content.paper_questions (
  paper_id uuid not null references content.papers(id) on delete cascade,
  section_id uuid references content.paper_sections(id) on delete set null,
  question_id uuid not null references content.questions(id) on delete cascade,
  position integer not null,
  primary key (paper_id, question_id),
  unique (paper_id, position)
);

create index if not exists paper_questions_by_question on content.paper_questions (question_id);
create index if not exists papers_by_exam on content.papers (exam_id, year desc);

-- An attempt records which paper it belonged to and with what terms, so changing a
-- paper's marking later cannot rewrite a finished result.
alter table public.attempts
  add column if not exists paper_id uuid references content.papers(id),
  add column if not exists paper_set_code text,
  add column if not exists locale text not null default 'en',
  add column if not exists marks_correct numeric(6, 2),
  add column if not exists marks_wrong numeric(6, 2),
  add column if not exists duration_seconds integer;

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'attempt_mode' and e.enumlabel = 'paper'
  ) then
    alter type public.attempt_mode add value 'paper';
  end if;
end
$$;

create index if not exists attempts_by_paper on public.attempts (paper_id) where paper_id is not null;

comment on table content.paper_sections is 'Subject split inside one paper. A single-subject paper has one section.';
comment on table content.paper_questions is 'Ordered membership: the paper owns the order, the question owns the text.';
comment on column content.question_localizations.current_version_id is 'Live version of this question in this language.';
