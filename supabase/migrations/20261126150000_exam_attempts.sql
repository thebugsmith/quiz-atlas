-- Exam attempts: the editable practice workspace.
--
-- Separate from public.attempts on purpose. A quiz answer is final (one accepted row per
-- question, non-negative points); an exam response is edited until submission, may be
-- multiple-select or numerical, and belongs to a paper whose marks can be negative. These
-- tables never touch the quiz tables, so quiz scoring, leaderboards and cleanup keep their
-- exact behaviour.
--
-- At creation the paper is frozen into the attempt: the prompt, the printed options and
-- the input policy are copied, so later content edits cannot change what a player saw.
-- Grading keys stay in content.exam_key_versions and are never read by these functions.

create type public.exam_attempt_mode as enum ('study', 'timed');
create type public.exam_attempt_state as enum ('ready', 'active', 'paused', 'submitted', 'expired', 'abandoned');

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid not null references content.papers (id) on delete restrict,
  paper_version_id uuid references content.paper_versions (id) on delete restrict,
  rule_version_id uuid references content.exam_rule_versions (id) on delete restrict,
  key_version_id uuid references content.exam_key_versions (id) on delete restrict,
  mode public.exam_attempt_mode not null,
  state public.exam_attempt_state not null default 'ready',
  locale text not null default 'en',
  cursor_item_id uuid,
  create_key text not null check (char_length(create_key) between 8 and 100),
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, create_key),
  constraint exam_attempts_active_started check (state <> 'active' or started_at is not null)
);

create index exam_attempts_owner_idx on public.exam_attempts (owner_id, created_at desc);
create index exam_attempts_by_paper on public.exam_attempts (paper_id);

-- One resumable study workspace per owner and paper. A second one is only created by an
-- explicit restart, which is why this is a partial unique index rather than a rule.
create unique index exam_attempts_one_study_idx
  on public.exam_attempts (owner_id, paper_id)
  where mode = 'study' and state in ('ready', 'active', 'paused');

create table public.exam_attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  position integer not null check (position > 0),
  section_subject text,
  question_id uuid references content.questions (id) on delete restrict,
  item_version_id uuid references content.exam_item_versions (id) on delete restrict,
  item_type text not null check (item_type in ('single_choice', 'multiple_select', 'numerical')),
  -- Frozen presentation: what the player actually saw, labels included.
  prompt text not null check (char_length(btrim(prompt)) > 0),
  stem text,
  statements text[] not null default '{}',
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  input_policy jsonb,
  printed_number integer,
  unique (attempt_id, position),
  constraint exam_attempt_items_one_source check (num_nonnulls(question_id, item_version_id) = 1)
);

create unique index exam_attempt_items_question_idx
  on public.exam_attempt_items (attempt_id, question_id) where question_id is not null;
create unique index exam_attempt_items_version_idx
  on public.exam_attempt_items (attempt_id, item_version_id) where item_version_id is not null;
create index exam_attempt_items_attempt_idx on public.exam_attempt_items (attempt_id, position);

create table public.exam_responses (
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  attempt_item_id uuid not null references public.exam_attempt_items (id) on delete cascade,
  -- Starts at 0 so the first accepted edit moves it to 1. A client sends the revision it
  -- last saw; a mismatch is a conflict, not a silent overwrite.
  revision integer not null default 0 check (revision >= 0),
  response jsonb,
  marked boolean not null default false,
  visited boolean not null default false,
  -- The answer recorded before the first check or reveal. Study totals compare against it.
  first_unaided jsonb,
  checked_at timestamptz,
  revealed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, attempt_item_id)
);

-- Idempotency per attempt: a retried mutation returns its original acknowledgment, and the
-- same key with different data is refused instead of applied twice.
create table public.exam_mutations (
  attempt_id uuid not null references public.exam_attempts (id) on delete cascade,
  mutation_key text not null check (char_length(mutation_key) between 8 and 100),
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (attempt_id, mutation_key)
);

create index exam_mutations_attempt_idx on public.exam_mutations (attempt_id, created_at);

alter table public.exam_attempts enable row level security;
alter table public.exam_attempt_items enable row level security;
alter table public.exam_responses enable row level security;
alter table public.exam_mutations enable row level security;

-- The owner may read the attempt shell (resume cards); items, responses and mutations are
-- server-only. Writes all go through the functions below.
create policy exam_attempts_select_own on public.exam_attempts
  for select to authenticated using (owner_id = (select auth.uid()));

alter table public.exam_attempts
  add constraint exam_attempts_cursor_fk
  foreign key (cursor_item_id) references public.exam_attempt_items (id) on delete set null;

-- Which finally printed label an option carries. Labels follow the paper's style; letters
-- are the default and cover NTA, SSC and CGPSC papers.
create or replace function public.exam_option_label(p_style text, p_index integer)
returns text
language sql
immutable
as $$
  select case
    when p_style = 'numbers' then (p_index + 1)::text
    else chr(65 + p_index)
  end;
$$;

-- Create the workspace, or hand back the one this owner already has for this paper.
-- Draft papers are refused unless the caller passes p_allow_draft, which the server sets
-- only from EXAM_ALLOW_DRAFT for synthetic development fixtures.
create or replace function public.exam_create_or_resume(
  p_owner uuid,
  p_paper_slug text,
  p_mode public.exam_attempt_mode,
  p_create_key text,
  p_locale text default 'en',
  p_allow_draft boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_paper content.papers%rowtype;
  v_attempt public.exam_attempts%rowtype;
  v_existing public.exam_attempts%rowtype;
  v_rule uuid;
  v_key uuid;
  v_version uuid;
  v_items integer := 0;
begin
  if p_mode <> 'study' then
    raise exception 'unsupported_mode' using errcode = '22023';
  end if;

  select * into v_paper from content.papers where slug = p_paper_slug and status <> 'archived';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_paper.status <> 'published'
     and not (p_allow_draft and v_paper.source_status = 'synthetic') then
    raise exception 'paper_not_published' using errcode = '22023';
  end if;

  -- Retried create returns the same attempt instead of a second one.
  select * into v_existing from public.exam_attempts
   where owner_id = p_owner and create_key = p_create_key;
  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id, 'created', false, 'state', v_existing.state,
      'mode', v_existing.mode, 'paper', p_paper_slug);
  end if;

  -- One resumable study attempt per paper: resume instead of duplicating.
  select * into v_existing from public.exam_attempts
   where owner_id = p_owner and paper_id = v_paper.id
     and mode = 'study' and state in ('ready', 'active', 'paused')
   for update;
  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id, 'created', false, 'state', v_existing.state,
      'mode', v_existing.mode, 'paper', p_paper_slug);
  end if;

  select id into v_rule from content.exam_rule_versions
   where paper_id = v_paper.id order by (status = 'published') desc, version_number desc limit 1;
  select id into v_key from content.exam_key_versions
   where paper_id = v_paper.id and status = 'published' order by version_number desc limit 1;
  select id into v_version from content.paper_versions
   where paper_id = v_paper.id and status = 'published' order by version_number desc limit 1;

  insert into public.exam_attempts
    (owner_id, paper_id, paper_version_id, rule_version_id, key_version_id, mode, state,
     locale, create_key, started_at)
  values
    (p_owner, v_paper.id, v_version, v_rule, v_key, p_mode, 'active', p_locale, p_create_key, now())
  returning * into v_attempt;

  -- Freeze the paper: legacy single-choice rows and typed exam items through one view.
  insert into public.exam_attempt_items
    (attempt_id, position, section_subject, question_id, item_version_id, item_type,
     prompt, stem, statements, options, input_policy)
  select
    v_attempt.id,
    m.position,
    s.subject,
    m.question_id,
    m.item_version_id,
    m.item_type,
    case when m.item_version_id is not null then v.prompt else qv.prompt end,
    case when m.item_version_id is not null then null else qv.stem end,
    case when m.item_version_id is not null then '{}'::text[] else qv.statements end,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', option ->> 'id',
                'label', public.exam_option_label('letters', (ordinality - 1)::int),
                'text', option ->> 'text'
              ) order by ordinality)
         from jsonb_array_elements(
                case when m.item_version_id is not null then v.options else qv.options end
              ) with ordinality as option),
      '[]'::jsonb
    ),
    v.input_policy
  from content.paper_manifest_items m
  left join content.paper_sections s on s.id = m.section_id
  left join content.exam_item_versions v on v.id = m.item_version_id
  left join content.question_versions qv on qv.id = (
    select q.current_version_id from content.questions q where q.id = m.question_id
  )
  where m.paper_id = v_paper.id
  order by m.position;

  get diagnostics v_items = row_count;
  if v_items = 0 then
    raise exception 'paper_has_no_items' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'created', true, 'state', v_attempt.state,
    'mode', v_attempt.mode, 'paper', p_paper_slug, 'items', v_items);
end;
$$;

-- The safe manifest: identity, position, prompts and options, current responses and
-- revisions. No keys, no correctness, no other player's data.
create or replace function public.exam_attempt_manifest(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_paper content.papers%rowtype;
  v_result jsonb;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_paper from content.papers where id = v_attempt.paper_id;

  select jsonb_build_object(
    'attempt_id', v_attempt.id,
    'mode', v_attempt.mode,
    'state', v_attempt.state,
    'locale', v_attempt.locale,
    'cursor_item_id', v_attempt.cursor_item_id,
    'started_at', v_attempt.started_at,
    'deadline_at', v_attempt.deadline_at,
    'paper', jsonb_build_object(
      'slug', v_paper.slug, 'label', coalesce(v_paper.paper_label, v_paper.paper_code),
      'year', v_paper.year, 'marks_correct', v_paper.marks_correct,
      'marks_wrong', v_paper.marks_wrong, 'duration_seconds', v_paper.duration_seconds
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', ai.id,
               'position', ai.position,
               'section', ai.section_subject,
               'type', ai.item_type,
               'prompt', ai.prompt,
               'stem', ai.stem,
               'statements', ai.statements,
               'options', ai.options,
               'input', ai.input_policy,
               'response', case when r.attempt_item_id is null then null else jsonb_build_object(
                 'value', r.response, 'revision', r.revision, 'marked', r.marked,
                 'visited', r.visited, 'checked', r.checked_at is not null,
                 'revealed', r.revealed_at is not null
               ) end
             ) order by ai.position)
        from public.exam_attempt_items ai
        left join public.exam_responses r
          on r.attempt_id = ai.attempt_id and r.attempt_item_id = ai.id
       where ai.attempt_id = v_attempt.id
    ), '[]'::jsonb),
    'answered', (
      select count(*)::int from public.exam_responses r
        join public.exam_attempt_items ai on ai.id = r.attempt_item_id
       where r.attempt_id = v_attempt.id and r.response is not null
         and r.response <> 'null'::jsonb
    ),
    'total', (select count(*)::int from public.exam_attempt_items where attempt_id = v_attempt.id)
  ) into v_result;

  return v_result;
end;
$$;

-- Is this response a legal answer for this item? Empty means cleared, which is explicit.
create or replace function public.exam_response_is_valid(
  p_item_type text, p_options jsonb, p_input jsonb, p_response jsonb
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_ids text[];
  v_kind text;
  v_values jsonb;
begin
  if p_response is null then
    return true;
  end if;
  if jsonb_typeof(p_response) <> 'object' then
    return false;
  end if;

  v_kind := p_response ->> 'kind';

  if p_item_type = 'single_choice' then
    if v_kind <> 'single' then return false; end if;
    if p_response ->> 'option_id' is null then return true; end if;
    return exists (
      select 1 from jsonb_array_elements(p_options) as option
       where option ->> 'id' = p_response ->> 'option_id'
    );
  end if;

  if p_item_type = 'multiple_select' then
    if v_kind <> 'multiple' then return false; end if;
    v_values := p_response -> 'option_ids';
    if v_values is null or jsonb_typeof(v_values) <> 'array' then return false; end if;
    if jsonb_array_length(v_values) > 10 then return false; end if;
    if (select count(distinct value) from jsonb_array_elements_text(v_values) as value)
       <> jsonb_array_length(v_values) then return false; end if;
    return not exists (
      select 1 from jsonb_array_elements_text(v_values) as value
       where not exists (
         select 1 from jsonb_array_elements(p_options) as option
          where option ->> 'id' = value
       )
    );
  end if;

  if p_item_type = 'numerical' then
    if v_kind <> 'numerical' then return false; end if;
    if p_response ->> 'value' is null then return true; end if;
    if (p_response ->> 'value') !~ '^-?[0-9]{1,9}(\.[0-9]{1,6})?$' then return false; end if;
    if coalesce(p_input ->> 'kind', '') = 'integer'
       and (p_response ->> 'value') !~ '^-?[0-9]{1,9}$' then
      return false;
    end if;
    if coalesce(p_input ->> 'kind', '') = 'decimal'
       and (p_input ->> 'max_decimal_places') is not null
       and (p_response ->> 'value') ~ '\.'
       and char_length(split_part(p_response ->> 'value', '.', 2))
           > (p_input ->> 'max_decimal_places')::int then
      return false;
    end if;
    return true;
  end if;

  return false;
end;
$$;

-- One accepted edit. Ownership, state, item membership, response shape, idempotency and
-- revision are all checked here, inside one transaction, with the row locked.
create or replace function public.exam_set_response(
  p_attempt_id uuid,
  p_owner uuid,
  p_item_id uuid,
  p_response jsonb,
  p_expected_revision integer,
  p_mutation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_item public.exam_attempt_items%rowtype;
  v_current integer;
  v_hash text;
  v_mutation public.exam_mutations%rowtype;
  v_revision integer;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.state <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.state using errcode = '22023';
  end if;

  select * into v_item from public.exam_attempt_items
   where id = p_item_id and attempt_id = p_attempt_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_hash := md5(coalesce(p_response::text, 'null') || '|' || p_item_id::text);

  select * into v_mutation from public.exam_mutations
   where attempt_id = p_attempt_id and mutation_key = p_mutation_key;
  if found then
    if v_mutation.payload_hash <> v_hash then
      raise exception 'idempotency_mismatch' using errcode = '22023';
    end if;
    return v_mutation.result;
  end if;

  if not public.exam_response_is_valid(v_item.item_type, v_item.options, v_item.input_policy, p_response) then
    raise exception 'invalid_response' using errcode = '22023';
  end if;

  select coalesce(revision, 0) into v_current from public.exam_responses
   where attempt_id = p_attempt_id and attempt_item_id = p_item_id;
  v_current := coalesce(v_current, 0);

  if v_current <> p_expected_revision then
    raise exception 'stale_revision:%', v_current using errcode = '22023';
  end if;

  insert into public.exam_responses
    (attempt_id, attempt_item_id, revision, response, visited, updated_at)
  values (p_attempt_id, p_item_id, v_current + 1, p_response, true, now())
  on conflict (attempt_id, attempt_item_id) do update set
    revision = public.exam_responses.revision + 1,
    response = excluded.response,
    visited = true,
    updated_at = now()
  returning revision into v_revision;

  update public.exam_attempts set updated_at = now() where id = p_attempt_id;

  insert into public.exam_mutations (attempt_id, mutation_key, payload_hash, result)
  values (
    p_attempt_id, p_mutation_key, v_hash,
    jsonb_build_object(
      'item_id', p_item_id, 'revision', v_revision, 'response', p_response,
      'saved_at', now()
    )
  )
  on conflict (attempt_id, mutation_key) do nothing;

  return jsonb_build_object(
    'item_id', p_item_id, 'revision', v_revision, 'response', p_response, 'saved_at', now());
end;
$$;

-- Marking for review is its own write: it must not bump a response revision or replace a
-- saved answer.
create or replace function public.exam_set_marked(
  p_attempt_id uuid, p_owner uuid, p_item_id uuid, p_marked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.exam_attempt_items where id = p_item_id and attempt_id = p_attempt_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.exam_responses (attempt_id, attempt_item_id, marked, visited, updated_at)
  values (p_attempt_id, p_item_id, p_marked, true, now())
  on conflict (attempt_id, attempt_item_id) do update set
    marked = excluded.marked, updated_at = now();

  return jsonb_build_object('item_id', p_item_id, 'marked', p_marked);
end;
$$;

-- Position and language are preferences, not answers: opening another question never
-- touches a response.
create or replace function public.exam_set_cursor(
  p_attempt_id uuid, p_owner uuid, p_item_id uuid, p_locale text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_item_id is not null and not exists (
    select 1 from public.exam_attempt_items where id = p_item_id and attempt_id = p_attempt_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.exam_attempts
     set cursor_item_id = coalesce(p_item_id, cursor_item_id),
         locale = coalesce(p_locale, locale),
         updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object(
    'cursor_item_id', coalesce(p_item_id, v_attempt.cursor_item_id),
    'locale', coalesce(p_locale, v_attempt.locale));
end;
$$;

revoke all on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean) from public;
revoke all on function public.exam_attempt_manifest(uuid, uuid) from public;
revoke all on function public.exam_set_response(uuid, uuid, uuid, jsonb, integer, text) from public;
revoke all on function public.exam_set_marked(uuid, uuid, uuid, boolean) from public;
revoke all on function public.exam_set_cursor(uuid, uuid, uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on
      public.exam_attempts, public.exam_attempt_items, public.exam_responses, public.exam_mutations
    to service_role;
    grant execute on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean) to service_role;
    grant execute on function public.exam_attempt_manifest(uuid, uuid) to service_role;
    grant execute on function public.exam_set_response(uuid, uuid, uuid, jsonb, integer, text) to service_role;
    grant execute on function public.exam_set_marked(uuid, uuid, uuid, boolean) to service_role;
    grant execute on function public.exam_set_cursor(uuid, uuid, uuid, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.exam_attempts, public.exam_attempt_items, public.exam_responses,
      public.exam_mutations from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.exam_attempt_items, public.exam_responses, public.exam_mutations
      from authenticated;
  end if;
end
$$;
