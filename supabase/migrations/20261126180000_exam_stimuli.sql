-- Complete objective papers: shared passages, statement lists, media references.
--
-- A passage is printed once and shared by several items, so it is its own versioned record
-- rather than a copy inside each item. The attempt freezes the passage text it showed, like
-- it freezes the prompts. Media is referenced by storage path; nothing is extracted here.

create table if not exists content.exam_stimuli (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique check (char_length(external_id) between 1 and 120),
  kind text not null default 'passage' check (kind in ('passage', 'table', 'diagram', 'case')),
  created_at timestamptz not null default now()
);

create table if not exists content.exam_stimulus_versions (
  id uuid primary key default gen_random_uuid(),
  stimulus_id uuid not null references content.exam_stimuli (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  locale text not null default 'en' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  -- Storage path of an optional figure; the text above stays readable without it.
  media_path text,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (stimulus_id, version_number)
);

create table if not exists content.exam_stimulus_localizations (
  stimulus_id uuid not null references content.exam_stimuli (id) on delete cascade,
  locale text not null,
  current_version_id uuid not null references content.exam_stimulus_versions (id) on delete restrict,
  primary key (stimulus_id, locale)
);

alter table content.exam_item_versions
  add column if not exists stimulus_id uuid references content.exam_stimuli (id) on delete restrict,
  add column if not exists statements text[] not null default '{}';

-- A statement list is only meaningful with a prompt that asks about it; limit the count
-- the same way quiz comprehension rows are limited.
alter table content.exam_item_versions
  add constraint exam_item_versions_statements_limit
    check (coalesce(array_length(statements, 1), 0) <= 8);

alter table public.exam_attempt_items
  add column if not exists stimulus text,
  add column if not exists stimulus_kind text,
  add column if not exists media_path text;

drop view if exists content.paper_manifest_items;
create view content.paper_manifest_items as
  select
    pq.paper_id, pq.position, pq.section_id, 'single_choice'::text as item_type,
    pq.question_id, null::uuid as item_version_id, null::jsonb as exam_options,
    null::jsonb as input_policy, null::jsonb as marking
  from content.paper_questions pq
  union all
  select
    epi.paper_id, epi.position, epi.section_id, v.item_type,
    null::uuid as question_id, epi.item_version_id, v.options as exam_options,
    v.input_policy, epi.marking
  from content.exam_paper_items epi
  join content.exam_item_versions v on v.id = epi.item_version_id;

-- Freeze the passage alongside the prompt. Replaces the EX05 function with the same
-- ownership, idempotency and draft rules.
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

  select * into v_existing from public.exam_attempts
   where owner_id = p_owner and create_key = p_create_key;
  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id, 'created', false, 'state', v_existing.state,
      'mode', v_existing.mode, 'paper', p_paper_slug);
  end if;

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

  insert into public.exam_attempt_items
    (attempt_id, position, section_subject, question_id, item_version_id, item_type,
     prompt, stem, statements, options, input_policy, stimulus, stimulus_kind, media_path)
  select
    v_attempt.id,
    m.position,
    s.subject,
    m.question_id,
    m.item_version_id,
    m.item_type,
    case when m.item_version_id is not null then v.prompt else qv.prompt end,
    case when m.item_version_id is not null then null else qv.stem end,
    case when m.item_version_id is not null then v.statements else qv.statements end,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', o.element ->> 'id',
                'label', public.exam_option_label('letters', (o.ordinality - 1)::int),
                'text', o.element ->> 'text'
              ) order by o.ordinality)
         from jsonb_array_elements(
                case when m.item_version_id is not null then v.options else qv.options end
              ) with ordinality as o(element, ordinality)),
      '[]'::jsonb
    ),
    v.input_policy,
    stim.body,
    st.kind,
    stim.media_path
  from content.paper_manifest_items m
  left join content.paper_sections s on s.id = m.section_id
  left join content.exam_item_versions v on v.id = m.item_version_id
  left join content.question_versions qv on qv.id = (
    select q.current_version_id from content.questions q where q.id = m.question_id
  )
  left join content.exam_stimuli st on st.id = v.stimulus_id
  left join content.exam_stimulus_versions stim on stim.id = (
    select l.current_version_id
      from content.exam_stimulus_localizations l
     where l.stimulus_id = st.id and l.locale = 'en'
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

-- Manifest: add the frozen passage and the optional-choice limit.
create or replace function public.exam_attempt_manifest(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_paper content.papers%rowtype;
  v_rule content.exam_rule_versions%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_paper from content.papers where id = v_attempt.paper_id;
  if v_attempt.rule_version_id is not null then
    select * into v_rule from content.exam_rule_versions where id = v_attempt.rule_version_id;
  end if;

  return jsonb_build_object(
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
    'rule', case when v_rule.id is null then null else jsonb_build_object(
      'timing', v_rule.timing, 'marking', v_rule.marking, 'navigation', v_rule.navigation,
      'choices', v_rule.choices, 'display', v_rule.display, 'version', v_rule.version_number
    ) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', ai.id,
               'position', ai.position,
               'section', ai.section_subject,
               'type', ai.item_type,
               'prompt', ai.prompt,
               'stem', ai.stem,
               'statements', ai.statements,
               'stimulus', case when ai.stimulus is null then null else jsonb_build_object(
                 'kind', ai.stimulus_kind, 'body', ai.stimulus, 'media_path', ai.media_path
               ) end,
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
       where r.attempt_id = v_attempt.id and r.response is not null
    ),
    'total', (select count(*)::int from public.exam_attempt_items where attempt_id = v_attempt.id)
  );
end;
$$;

revoke all on function public.exam_attempt_manifest(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on
      content.exam_stimuli, content.exam_stimulus_versions, content.exam_stimulus_localizations
    to service_role;
    grant execute on function public.exam_attempt_manifest(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on content.exam_stimuli, content.exam_stimulus_versions,
      content.exam_stimulus_localizations from anon;
    revoke all on function public.exam_attempt_manifest(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on content.exam_stimuli, content.exam_stimulus_versions,
      content.exam_stimulus_localizations from authenticated;
    revoke all on function public.exam_attempt_manifest(uuid, uuid) from authenticated;
  end if;
end
$$;
