-- Daily Challenge: one immutable set of ten questions per UTC date, one ranked
-- attempt per account, and an embargoed review until the window closes.
--
-- The set is created once under an advisory lock, so two requests arriving at the
-- same millisecond cannot produce two different challenges for the same date.

create table if not exists public.daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  locale text not null default 'en',
  rules_version integer not null default 1,
  question_count integer not null check (question_count > 0),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_challenge_questions (
  challenge_id uuid not null references public.daily_challenges (id) on delete cascade,
  position integer not null check (position > 0),
  question_id uuid not null references content.questions (id) on delete restrict,
  question_version_id uuid not null references content.question_versions (id) on delete restrict,
  option_order jsonb not null,
  primary key (challenge_id, position),
  unique (challenge_id, question_version_id)
);

alter table public.daily_challenges enable row level security;
alter table public.daily_challenge_questions enable row level security;

-- One ranked daily attempt per account per challenge. Replays after closure and guest
-- attempts are unranked, so they do not collide with this slot.
create unique index if not exists attempts_one_ranked_daily
  on public.attempts (owner_id, ((config ->> 'challengeId')))
  where mode = 'daily' and (config ->> 'ranked') = 'true';

/**
 * Builds (or returns) the set for a UTC date. Idempotent under concurrency: the
 * transaction-scoped lock makes the second caller wait and then read what the first
 * one wrote.
 */
create or replace function public.game_ensure_daily_challenge(p_date date default null)
returns public.daily_challenges
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'utc')::date);
  v_challenge public.daily_challenges%rowtype;
  v_count integer;
  v_pool integer;
begin
  perform pg_advisory_xact_lock(hashtext('daily_challenge:' || v_date::text));

  select * into v_challenge from public.daily_challenges where challenge_date = v_date;
  if found then
    return v_challenge;
  end if;

  select count(*) into v_pool
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
     and q.quarantined_at is null
     and t.is_active;

  if v_pool < 10 then
    raise exception 'insufficient_inventory:%', v_pool using errcode = 'P0002';
  end if;

  insert into public.daily_challenges (challenge_date, locale, question_count)
  values (v_date, 'en', 10)
  returning * into v_challenge;

  -- Same order for everyone: a stable hash of the date and the question id.
  insert into public.daily_challenge_questions
    (challenge_id, position, question_id, question_version_id, option_order)
  select v_challenge.id,
         row_number() over (order by md5(v_date::text || q.id::text)),
         q.id,
         v.id,
         (select jsonb_agg((option ->> 'id')::integer order by (option ->> 'id')::integer)
            from jsonb_array_elements(v.options) as option)
    from content.questions q
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where q.archived_at is null
     and q.quarantined_at is null
     and t.is_active
   order by md5(v_date::text || q.id::text)
   limit 10;

  get diagnostics v_count = row_count;

  update public.daily_challenges set question_count = v_count where id = v_challenge.id
  returning * into v_challenge;

  return v_challenge;
end;
$$;

revoke all on function public.game_ensure_daily_challenge(date) from public;

/** Today's state for one player: the window, their slot, and what the page should offer. */
create or replace function public.game_daily_status(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date := (now() at time zone 'utc')::date;
  v_challenge public.daily_challenges%rowtype;
  v_attempt public.attempts%rowtype;
  v_closes timestamptz := ((now() at time zone 'utc')::date + 1)::timestamp at time zone 'utc';
  v_previous jsonb;
  v_can_start boolean := true;
begin
  v_challenge := public.game_ensure_daily_challenge(v_date);

  select * into v_attempt
    from public.attempts
   where owner_id = p_owner
     and mode = 'daily'
     and (config ->> 'challengeId') = v_challenge.id::text
     and (config ->> 'ranked') = 'true'
   order by created_at
   limit 1;

  if found then
    v_can_start := false;
  end if;

  select jsonb_build_object(
           'attempt_id', a.id, 'status', a.status, 'score', a.score,
           'correct_count', a.correct_count, 'wrong_count', a.wrong_count,
           'question_count', a.question_count, 'finished_at', a.finished_at
         )
    into v_previous
    from public.attempts a
   where a.owner_id = p_owner
     and a.mode = 'daily'
     and (a.config ->> 'challengeId') = v_challenge.id::text
   order by a.created_at desc
   limit 1;

  return jsonb_build_object(
    'challenge_id', v_challenge.id,
    'date', v_challenge.challenge_date,
    'question_count', v_challenge.question_count,
    'closes_at', v_closes,
    'closed', v_challenge.closed_at is not null or v_challenge.challenge_date < v_date,
    'attempt', v_previous,
    'can_start_ranked', v_can_start,
    'ranked', v_attempt.id is not null
  );
end;
$$;

revoke all on function public.game_daily_status(uuid) from public;

/**
 * Reserves the ranked slot and freezes the set into an attempt. A second call for the
 * same account and challenge fails with `already_played`; guests get an unranked
 * attempt that can never become ranked.
 */
create or replace function public.game_create_daily_attempt(
  p_owner uuid,
  p_create_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_challenge public.daily_challenges%rowtype;
  v_existing public.attempts%rowtype;
  v_attempt public.attempts%rowtype;
  v_ranked boolean;
  v_guest boolean;
begin
  v_challenge := public.game_ensure_daily_challenge();

  select is_anonymous into v_guest from auth.users where id = p_owner;
  v_ranked := not coalesce(v_guest, true);

  select * into v_existing
    from public.attempts
   where owner_id = p_owner and create_key = p_create_key;
  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id, 'status', v_existing.status, 'mode', 'daily',
      'question_count', v_existing.question_count, 'reused', true
    );
  end if;

  if v_ranked then
    select * into v_existing
      from public.attempts
     where owner_id = p_owner
       and mode = 'daily'
       and (config ->> 'challengeId') = v_challenge.id::text
       and (config ->> 'ranked') = 'true';
    if found then
      -- Replay is allowed only once the window has closed, and it is unranked.
      if v_challenge.closed_at is not null
         or v_challenge.challenge_date < (now() at time zone 'utc')::date then
        v_ranked := false;
      else
        raise exception 'already_played' using errcode = 'P0001';
      end if;
    end if;
  end if;

  insert into public.attempts (owner_id, mode, status, config, rules_version,
                               selection_seed, question_count, create_key)
  values (
    p_owner, 'daily', 'ready',
    jsonb_build_object(
      'challengeId', v_challenge.id,
      'challengeDate', v_challenge.challenge_date,
      'ranked', v_ranked
    ),
    v_challenge.rules_version,
    v_challenge.id::text,
    v_challenge.question_count,
    p_create_key
  )
  returning * into v_attempt;

  insert into public.attempt_questions (attempt_id, position, question_id, question_version_id, option_order)
  select v_attempt.id, dcq.position, dcq.question_id, dcq.question_version_id, dcq.option_order
    from public.daily_challenge_questions dcq
   where dcq.challenge_id = v_challenge.id
   order by dcq.position;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'status', v_attempt.status, 'mode', 'daily',
    'question_count', v_attempt.question_count, 'reused', false
  );
end;
$$;

revoke all on function public.game_create_daily_attempt(uuid, text) from public;

/**
 * Daily answers acknowledge submission only. Correctness, the correct option id, the
 * explanation and the running score are all withheld until the window closes.
 */
create or replace function public.game_submit_daily_answer(
  p_attempt_id uuid,
  p_owner uuid,
  p_position integer,
  p_option_id integer,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_action = 'reveal' then
    raise exception 'reveal_not_allowed' using errcode = 'P0001';
  end if;

  v_result := public.game_submit_answer(
    p_attempt_id, p_owner, p_position, p_option_id, p_action, p_idempotency_key
  );

  return jsonb_build_object(
    'accepted', v_result -> 'accepted',
    'replayed', v_result -> 'replayed',
    'position', v_result -> 'position',
    'action', v_result -> 'action'
  );
end;
$$;

revoke all on function public.game_submit_daily_answer(uuid, uuid, integer, integer, text, text) from public;

create or replace function public.game_attempt_review(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_attempt public.attempts%rowtype;
  v_questions jsonb;
  v_answered integer;
  v_accuracy numeric;
  v_closed boolean := true;
  v_challenge uuid;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- A daily attempt stays embargoed until its challenge window has closed: aggregate
  -- numbers yes, per-question truth no.
  if v_attempt.mode = 'daily' then
    v_challenge := nullif(v_attempt.config ->> 'challengeId', '')::uuid;
    if v_challenge is not null then
      select coalesce(c.closed_at is not null or c.challenge_date < (now() at time zone 'utc')::date, false)
        into v_closed
        from public.daily_challenges c
       where c.id = v_challenge;
    end if;
  end if;

  select count(*) into v_answered
    from public.attempt_answers aa
   where aa.attempt_id = v_attempt.id;

  v_accuracy := case
    when (v_attempt.correct_count + v_attempt.wrong_count) = 0 then 0
    else round(100.0 * v_attempt.correct_count / (v_attempt.correct_count + v_attempt.wrong_count), 1)
  end;

  select coalesce(jsonb_agg(entry order by entry ->> 'position'), '[]'::jsonb)
    into v_questions
    from (
      select jsonb_build_object(
               'position', aq.position,
               'prompt', v.prompt,
               'stem', v.stem,
               'statements', to_jsonb(v.statements),
               'options', (
                 select jsonb_agg(
                          jsonb_build_object('id', (option ->> 'id')::integer, 'text', option ->> 'text')
                          order by array_position(
                            array(select jsonb_array_elements_text(aq.option_order)),
                            option ->> 'id'
                          )
                        )
                   from jsonb_array_elements(v.options) as option
               ),
               'selected_option_id', case when aa.selected_option_id is null then null
                                          else aa.selected_option_id::integer end,
               'correct_option_id', v.correct_option_id,
               'is_correct', coalesce(aa.is_correct, false),
               'points', coalesce(aa.points_awarded, 0),
               'action', aa.action,
               'accepted_at', aa.accepted_at,
               'explanation', v.explanation,
               'topic', jsonb_build_object('slug', t.slug, 'name', t.name)
             ) as entry
        from public.attempt_questions aq
        join content.question_versions v on v.id = aq.question_version_id
        join content.topics t on t.id = v.topic_id
        left join public.attempt_answers aa on aa.attempt_question_id = aq.id
       where aq.attempt_id = v_attempt.id
    ) as rows;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', v_attempt.id,
      'mode', v_attempt.mode,
      'status', v_attempt.status,
      'score', v_attempt.score,
      'question_count', v_attempt.question_count,
      'correct_count', v_attempt.correct_count,
      'wrong_count', v_attempt.wrong_count,
      'skipped_count', v_attempt.skipped_count,
      'answered_count', v_answered,
      'accuracy', v_accuracy,
      'config', v_attempt.config,
      'rules_version', v_attempt.rules_version,
      'started_at', v_attempt.started_at,
      'finished_at', v_attempt.finished_at
    ),
    -- Classic reveals everything once the attempt is finished. Daily returns
    -- `aggregate` until its window closes, so result components must handle both.
    'reveal', case
      when v_attempt.status = 'active' then 'aggregate'
      when v_attempt.mode = 'daily' and not v_closed then 'aggregate'
      else 'full'
    end,
    'questions', case
      when v_attempt.status = 'active' then '[]'::jsonb
      when v_attempt.mode = 'daily' and not v_closed then '[]'::jsonb
      else v_questions
    end
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_ensure_daily_challenge(date) to service_role;
    grant execute on function public.game_daily_status(uuid) to service_role;
    grant execute on function public.game_create_daily_attempt(uuid, text) to service_role;
    grant execute on function public.game_submit_daily_answer(uuid, uuid, integer, integer, text, text) to service_role;
    grant execute on function public.game_attempt_review(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_ensure_daily_challenge(date) from anon;
    revoke all on function public.game_daily_status(uuid) from anon;
    revoke all on function public.game_create_daily_attempt(uuid, text) from anon;
    revoke all on function public.game_submit_daily_answer(uuid, uuid, integer, integer, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_ensure_daily_challenge(date) from authenticated;
    revoke all on function public.game_daily_status(uuid) from authenticated;
    revoke all on function public.game_create_daily_attempt(uuid, text) from authenticated;
    revoke all on function public.game_submit_daily_answer(uuid, uuid, integer, integer, text, text) from authenticated;
  end if;
end
$$;
