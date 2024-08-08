-- Player reports, moderation, quarantine and the audit trail.
--
-- A report is tied to the exact version the player saw, so moderation can act on
-- that version without rewriting what anyone already answered. Quarantine only
-- affects questions dealt to new sessions; an attempt already in flight keeps its
-- questions and its result, and nothing here updates a stored answer or score.

create type public.report_reason as enum (
  'incorrect_answer', 'ambiguous', 'outdated', 'typo', 'inappropriate', 'other'
);
create type public.report_status as enum ('open', 'resolved', 'dismissed');

alter table content.questions
  add column if not exists quarantined_at timestamptz;

comment on column content.questions.quarantined_at is
  'Set by moderation. Quarantined questions are never dealt to new attempts.';

create table public.question_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references content.questions (id) on delete cascade,
  question_version_id uuid not null references content.question_versions (id) on delete cascade,
  -- The attempt the report came from, when it came from one. Kept for evidence only.
  attempt_id uuid references public.attempts (id) on delete set null,
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 1000),
  status public.report_status not null default 'open',
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- One open report per player per version: re-reporting the same thing is noise.
create unique index question_reports_one_open_per_player
  on public.question_reports (reporter_id, question_version_id)
  where status = 'open';

create index question_reports_open_idx on public.question_reports (created_at)
  where status = 'open';
create index question_reports_version_idx on public.question_reports (question_version_id);

alter table public.question_reports enable row level security;

create policy question_reports_select_own on public.question_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Trusted actions are recorded so a quarantine or a resolution can be explained later.
create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit enable row level security;

-- Voided attempts keep their answers and score; they are simply excluded from
-- competitive views (leaderboards, milestone 18). Never a silent regrade.
alter table public.attempts
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;


create or replace function public.game_report_question(
  p_reporter uuid,
  p_question_version_id uuid,
  p_attempt_id uuid,
  p_reason text,
  p_details text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_question_id uuid;
  v_recent integer;
  v_id uuid;
  v_attempt_owner uuid;
begin
  if p_reason not in ('incorrect_answer', 'ambiguous', 'outdated', 'typo', 'inappropriate', 'other') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_details is not null and char_length(p_details) > 1000 then
    raise exception 'details_too_long' using errcode = '22023';
  end if;

  select question_id into v_question_id
    from content.question_versions where id = p_question_version_id;
  if v_question_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- A report may point at an attempt, but only the player's own attempt.
  if p_attempt_id is not null then
    select owner_id into v_attempt_owner from public.attempts where id = p_attempt_id;
    if v_attempt_owner is null or v_attempt_owner <> p_reporter then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  select count(*) into v_recent
    from public.question_reports
   where reporter_id = p_reporter and created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'too_many_reports' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.question_reports
     where reporter_id = p_reporter and question_version_id = p_question_version_id
       and status = 'open'
  ) then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;

  insert into public.question_reports
    (reporter_id, question_id, question_version_id, attempt_id, reason, details)
  values (p_reporter, v_question_id, p_question_version_id, p_attempt_id, p_reason::public.report_reason,
          nullif(btrim(coalesce(p_details, '')), ''))
  returning id into v_id;

  return jsonb_build_object('report_id', v_id, 'status', 'open');
end;
$$;

revoke all on function public.game_report_question(uuid, uuid, uuid, text, text) from public;

create or replace function public.admin_report_queue(p_actor uuid, p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  perform public.admin_require(p_actor);

  if p_status not in ('open', 'resolved', 'dismissed', 'all') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(row order by row ->> 'created_at' desc), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'report_id', r.id,
               'reason', r.reason,
               'details', r.details,
               'status', r.status,
               'created_at', r.created_at,
               'question_id', r.question_id,
               'question_version_id', r.question_version_id,
               'version_number', v.version_number,
               'prompt', v.prompt,
               'external_id', q.external_id,
               'topic_name', t.name,
               'quarantined', q.quarantined_at is not null,
               'archived', q.archived_at is not null,
               'resolution_note', r.resolution_note,
               'resolved_at', r.resolved_at
             ) as row
        from public.question_reports r
        join content.question_versions v on v.id = r.question_version_id
        join content.questions q on q.id = r.question_id
        join content.topics t on t.id = v.topic_id
       where p_status = 'all' or r.status = p_status::public.report_status
       limit 200
    ) rows;

  return jsonb_build_object('reports', v_rows);
end;
$$;

revoke all on function public.admin_report_queue(uuid, text) from public;

-- Resolution records a decision. It never touches answers, scores or history.
create or replace function public.admin_resolve_report(
  p_actor uuid,
  p_report_id uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.question_reports%rowtype;
begin
  perform public.admin_require(p_actor);

  if p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_report from public.question_reports where id = p_report_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_report.status <> 'open' then
    raise exception 'already_handled' using errcode = 'P0001';
  end if;

  update public.question_reports
     set status = p_status::public.report_status,
         resolution_note = nullif(btrim(coalesce(p_note, '')), ''),
         resolved_by = p_actor,
         resolved_at = now()
   where id = p_report_id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'report_' || p_status, 'question_report', p_report_id,
          jsonb_build_object('question_id', v_report.question_id,
                             'question_version_id', v_report.question_version_id,
                             'note', p_note));

  return jsonb_build_object('report_id', p_report_id, 'status', p_status);
end;
$$;

revoke all on function public.admin_resolve_report(uuid, uuid, text, text) from public;

create or replace function public.admin_quarantine_question(
  p_actor uuid,
  p_question_id uuid,
  p_quarantine boolean,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.admin_require(p_actor);

  update content.questions
     set quarantined_at = case when p_quarantine then now() else null end,
         updated_at = now()
   where id = p_question_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor,
          case when p_quarantine then 'question_quarantined' else 'question_released' end,
          'question', p_question_id, jsonb_build_object('note', p_note));

  return jsonb_build_object('question_id', p_question_id, 'quarantined', p_quarantine);
end;
$$;

revoke all on function public.admin_quarantine_question(uuid, uuid, boolean, text) from public;

-- Voiding is a label, not a rewrite: the attempt keeps every answer it had.
create or replace function public.admin_void_attempt(
  p_actor uuid,
  p_attempt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.attempts%rowtype;
begin
  perform public.admin_require(p_actor);

  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.voided_at is not null then
    raise exception 'already_voided' using errcode = 'P0001';
  end if;

  update public.attempts
     set voided_at = now(), void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_attempt_id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'attempt_voided', 'attempt', p_attempt_id,
          jsonb_build_object('mode', v_attempt.mode, 'reason', p_reason,
                             'score', v_attempt.score, 'question_count', v_attempt.question_count));

  return jsonb_build_object('attempt_id', p_attempt_id, 'voided', true);
end;
$$;

revoke all on function public.admin_void_attempt(uuid, uuid, text) from public;

-- Quarantined questions are excluded from new sessions only. Everything else in
-- these two functions is unchanged from the versions they replace.
create or replace function public.game_create_attempt(
  p_attempt_id uuid,
  p_owner uuid,
  p_seed text,
  p_mode text,
  p_topics text[],
  p_difficulty text,
  p_count integer,
  p_duration_seconds integer,
  p_create_key text
)
returns jsonb
language plpgsql
as $$
declare
  v_available integer;
  v_created integer;
  v_existing public.attempts%rowtype;
  v_attempt public.attempts%rowtype;
  v_mode public.attempt_mode;
  v_count integer;
begin
  if p_mode not in ('classic', 'time_rush') then
    raise exception 'unsupported_mode' using errcode = '22023';
  end if;
  v_mode := p_mode::public.attempt_mode;

  if v_mode = 'classic' and (p_count < 1 or p_count > 50) then
    raise exception 'invalid_count' using errcode = '22023';
  end if;
  if v_mode = 'time_rush' and (p_duration_seconds is null or p_duration_seconds not in (30, 60, 120)) then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;

  select * into v_existing
    from public.attempts
   where owner_id = p_owner and create_key = p_create_key;

  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id,
      'status', v_existing.status,
      'mode', v_existing.mode,
      'question_count', v_existing.question_count,
      'reused', true
    );
  end if;

  select count(*) into v_available
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
         and q.quarantined_at is null
     and t.is_active
     and t.slug = any (p_topics)
     and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty);

  -- Time Rush players answer until the clock or the queue runs out, so the only
  -- requirement is a non-empty pool, capped at the 200-question queue limit.
  if v_mode = 'time_rush' then
    if v_available = 0 then
      raise exception 'insufficient_inventory:%', v_available using errcode = 'P0002';
    end if;
    v_count := least(v_available, 200);
  else
    v_count := p_count;
    if v_available < v_count then
      raise exception 'insufficient_inventory:%', v_available using errcode = 'P0002';
    end if;
  end if;

  insert into public.attempts (id, owner_id, mode, status, config, rules_version,
                               selection_seed, question_count, create_key)
  values (
    p_attempt_id, p_owner, v_mode, 'ready',
    jsonb_build_object(
      'topics', p_topics,
      'difficulty', p_difficulty,
      'count', v_count,
      'durationSeconds', p_duration_seconds
    ),
    1, p_seed, v_count, p_create_key
  )
  returning * into v_attempt;

  insert into public.attempt_questions (attempt_id, position, question_id, question_version_id, option_order)
  select v_attempt.id,
         row_number() over (order by c.pick_rank, md5(v_attempt.selection_seed || c.id::text)),
         c.id, c.version_id,
         (
           select jsonb_agg((option ->> 'id')::integer order by (option ->> 'id')::integer)
             from jsonb_array_elements(c.options) as option
         )
    from (
      select q.id, v.id as version_id, v.options,
             row_number() over (
               partition by t.slug
               order by md5(v_attempt.selection_seed || q.id::text)
             ) as pick_rank
        from content.questions q
        join content.question_versions v on v.id = q.current_version_id
        join content.topics t on t.id = v.topic_id
       where q.archived_at is null
         and q.quarantined_at is null
         and t.is_active
         and t.slug = any (p_topics)
         and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty)
    ) as c
   order by c.pick_rank, md5(v_attempt.selection_seed || c.id::text)
   limit v_count;

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'mode', v_attempt.mode,
    'question_count', v_created,
    'reused', false
  );
end;
$$;

create or replace function public.game_create_practice_attempt(
  p_attempt_id uuid,
  p_owner uuid,
  p_seed text,
  p_source text,
  p_topics text[],
  p_difficulty text,
  p_count integer,
  p_create_key text
)
returns jsonb
language plpgsql
as $$
declare
  v_available integer;
  v_created integer;
  v_existing public.attempts%rowtype;
  v_attempt public.attempts%rowtype;
begin
  if p_source not in ('topics', 'bookmarks', 'missed') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  if p_count < 1 or p_count > 50 then
    raise exception 'invalid_count' using errcode = '22023';
  end if;

  select * into v_existing
    from public.attempts
   where owner_id = p_owner and create_key = p_create_key;

  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id, 'status', v_existing.status, 'mode', v_existing.mode,
      'question_count', v_existing.question_count, 'reused', true
    );
  end if;

  select count(*) into v_available
    from (
      select q.id
        from content.questions q
        join content.question_versions v on v.id = q.current_version_id
        join content.topics t on t.id = v.topic_id
       where q.archived_at is null
     and q.quarantined_at is null
         and t.is_active
         and (
           (p_source = 'topics'
             and t.slug = any (p_topics)
             and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty))
           or (p_source = 'bookmarks'
             and exists (select 1 from public.bookmarks b
                          where b.question_id = q.id and b.owner_id = p_owner))
           or (p_source = 'missed'
             and exists (select 1
                           from public.attempt_answers aa
                           join public.attempt_questions aq on aq.id = aa.attempt_question_id
                           join public.attempts a on a.id = aq.attempt_id
                          where a.owner_id = p_owner
                            and aq.question_id = q.id
                            and aa.action = 'answer'
                            and not aa.is_correct))
         )
    ) as pool;

  if v_available = 0 then
    raise exception 'insufficient_inventory:%', v_available using errcode = 'P0002';
  end if;

  insert into public.attempts (id, owner_id, mode, status, config, rules_version,
                               selection_seed, question_count, create_key)
  values (
    p_attempt_id, p_owner, 'practice', 'ready',
    jsonb_build_object(
      'topics', p_topics, 'difficulty', p_difficulty, 'count', least(p_count, v_available),
      'source', p_source, 'ranked', false
    ),
    1, p_seed, least(p_count, v_available), p_create_key
  )
  returning * into v_attempt;

  insert into public.attempt_questions (attempt_id, position, question_id, question_version_id, option_order)
  select v_attempt.id,
         row_number() over (order by md5(v_attempt.selection_seed || q.id::text)),
         q.id, v.id,
         (select jsonb_agg((option ->> 'id')::integer order by (option ->> 'id')::integer)
            from jsonb_array_elements(v.options) as option)
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
     and q.quarantined_at is null
     and t.is_active
     and (
       (p_source = 'topics'
         and t.slug = any (p_topics)
         and (p_difficulty = 'mixed' or v.difficulty::text = p_difficulty))
       or (p_source = 'bookmarks'
         and exists (select 1 from public.bookmarks b
                      where b.question_id = q.id and b.owner_id = p_owner))
       or (p_source = 'missed'
         and exists (select 1
                       from public.attempt_answers aa
                       join public.attempt_questions aq on aq.id = aa.attempt_question_id
                       join public.attempts a on a.id = aq.attempt_id
                      where a.owner_id = p_owner
                        and aq.question_id = q.id
                        and aa.action = 'answer'
                        and not aa.is_correct))
     )
   order by md5(v_attempt.selection_seed || q.id::text)
   limit least(p_count, v_available);

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'status', v_attempt.status, 'mode', v_attempt.mode,
    'question_count', v_created, 'reused', false
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_report_question(uuid, uuid, uuid, text, text) to service_role;
    grant execute on function public.admin_report_queue(uuid, text) to service_role;
    grant execute on function public.admin_resolve_report(uuid, uuid, text, text) to service_role;
    grant execute on function public.admin_quarantine_question(uuid, uuid, boolean, text) to service_role;
    grant execute on function public.admin_void_attempt(uuid, uuid, text) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_report_question(uuid, uuid, uuid, text, text) from anon;
    revoke all on function public.admin_report_queue(uuid, text) from anon;
    revoke all on function public.admin_resolve_report(uuid, uuid, text, text) from anon;
    revoke all on function public.admin_quarantine_question(uuid, uuid, boolean, text) from anon;
    revoke all on function public.admin_void_attempt(uuid, uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_report_question(uuid, uuid, uuid, text, text) from authenticated;
    revoke all on function public.admin_report_queue(uuid, text) from authenticated;
    revoke all on function public.admin_resolve_report(uuid, uuid, text, text) from authenticated;
    revoke all on function public.admin_quarantine_question(uuid, uuid, boolean, text) from authenticated;
    revoke all on function public.admin_void_attempt(uuid, uuid, text) from authenticated;
  end if;
end
$$;
