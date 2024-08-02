-- Practice mode and bookmarks.
--
-- Practice is unranked by construction: no counter, leaderboard or personal best is
-- touched, and the attempt records `ranked: false` in its frozen config.

create table if not exists public.bookmarks (
  owner_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references content.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, question_id)
);

alter table public.bookmarks enable row level security;

create policy bookmarks_select_own on public.bookmarks
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy bookmarks_insert_own on public.bookmarks
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy bookmarks_delete_own on public.bookmarks
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Reveal is an explicit, unscored practice action.
create or replace function public.game_submit_answer(
  p_attempt_id uuid,
  p_owner uuid,
  p_position integer,
  p_option_id integer,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_question public.attempt_questions%rowtype;
  v_version content.question_versions%rowtype;
  v_existing public.attempt_answers%rowtype;
  v_is_correct boolean := false;
  v_points integer := 0;
  v_action public.answer_action;
begin
  if p_action not in ('answer', 'skip', 'reveal') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  v_action := p_action::public.answer_action;

  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- Revealing the answer is a practice-only, unscored action.
  if v_action = 'reveal' and v_attempt.mode <> 'practice' then
    raise exception 'reveal_not_allowed' using errcode = 'P0001';
  end if;
  if v_attempt.status <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.status using errcode = 'P0001';
  end if;

  select * into v_question
    from public.attempt_questions
   where attempt_id = v_attempt.id and position = v_attempt.current_position + 1;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_version from content.question_versions where id = v_question.question_version_id;

  select * into v_existing from public.attempt_answers where attempt_question_id = v_question.id;

  if found then
    if v_existing.idempotency_key = p_idempotency_key then
      return jsonb_build_object(
        'accepted', true, 'replayed', true, 'action', v_existing.action,
        'position', v_question.position, 'is_correct', v_existing.is_correct,
        'points', v_existing.points_awarded,
        'correct_option_id', v_version.correct_option_id,
        'explanation', v_version.explanation, 'score', v_attempt.score
      );
    end if;
    raise exception 'already_answered' using errcode = 'P0001';
  end if;

  if v_attempt.expires_at is not null and now() >= v_attempt.expires_at then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;

  if p_position <> v_attempt.current_position + 1 then
    raise exception 'stale_position:%', v_attempt.current_position + 1 using errcode = 'P0001';
  end if;

  if v_action = 'answer' then
    if p_option_id is null or not exists (
      select 1 from jsonb_array_elements(v_version.options) as option
       where (option ->> 'id')::integer = p_option_id
    ) then
      raise exception 'invalid_option' using errcode = '22023';
    end if;
    v_is_correct := v_version.correct_option_id = p_option_id;
    v_points := case when v_is_correct then 100 else 0 end;
  end if;

  insert into public.attempt_answers
    (attempt_id, attempt_question_id, action, selected_option_id, is_correct, points_awarded, idempotency_key)
  values
    (v_attempt.id, v_question.id, v_action,
     case when v_action = 'answer' then p_option_id::text else null end,
     v_is_correct, v_points, p_idempotency_key);

  update public.attempts
     set score = score + v_points,
         correct_count = correct_count + case when v_is_correct then 1 else 0 end,
         wrong_count = wrong_count + case when v_action = 'answer' and not v_is_correct then 1 else 0 end,
         skipped_count = skipped_count + case when v_action = 'skip' then 1 else 0 end
   where id = v_attempt.id
   returning * into v_attempt;

  return jsonb_build_object(
    'accepted', true, 'replayed', false, 'action', v_action,
    'position', v_question.position, 'is_correct', v_is_correct,
    'points', v_points,
    'correct_option_id', v_version.correct_option_id,
    'explanation', v_version.explanation, 'score', v_attempt.score
  );
end;
$$;

-- Practice questions come from the player's own bookmarks, their past mistakes, or
-- the ordinary topic filters. A single question is a valid practice session.
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

-- Server-only bookmark writes: the client sends a question id, never an owner.
create or replace function public.game_set_bookmark(p_owner uuid, p_question_id uuid, p_bookmarked boolean)
returns jsonb
language plpgsql
as $$
begin
  if p_bookmarked then
    insert into public.bookmarks (owner_id, question_id)
    values (p_owner, p_question_id)
    on conflict do nothing;
  else
    delete from public.bookmarks where owner_id = p_owner and question_id = p_question_id;
  end if;

  return jsonb_build_object(
    'bookmarked', p_bookmarked,
    'owner_id', p_owner,
    'question_id', p_question_id
  );
end;
$$;

revoke all on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) from public;
revoke all on function public.game_create_practice_attempt(uuid, uuid, text, text, text[], text, integer, text) from public;
revoke all on function public.game_set_bookmark(uuid, uuid, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_submit_answer(uuid, uuid, integer, integer, text, text) to service_role;
    grant execute on function public.game_create_practice_attempt(uuid, uuid, text, text, text[], text, integer, text) to service_role;
    grant execute on function public.game_set_bookmark(uuid, uuid, boolean) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_create_practice_attempt(uuid, uuid, text, text, text[], text, integer, text) from anon;
    revoke all on function public.game_set_bookmark(uuid, uuid, boolean) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_create_practice_attempt(uuid, uuid, text, text, text[], text, integer, text) from authenticated;
    revoke all on function public.game_set_bookmark(uuid, uuid, boolean) from authenticated;
  end if;
end
$$;

-- Bookmarked questions, described well enough to list and practise.
create or replace function public.game_list_bookmarks(p_owner uuid)
returns table (question_id uuid, prompt text, topic_slug text, topic_name text, created_at timestamptz)
language sql
stable
as $$
  select q.id, v.prompt, t.slug, t.name, b.created_at
    from public.bookmarks b
    join content.questions q on q.id = b.question_id
    join content.question_versions v on v.id = q.current_version_id
    join content.topics t on t.id = v.topic_id
   where b.owner_id = p_owner
     and q.archived_at is null
   order by b.created_at desc;
$$;

revoke all on function public.game_list_bookmarks(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_list_bookmarks(uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_list_bookmarks(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_list_bookmarks(uuid) from authenticated;
  end if;
end
$$;

-- The game screen needs the question id to toggle a bookmark.
create or replace function public.game_current_question(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
as $$
declare
  v_attempt public.attempts%rowtype;
  v_result jsonb;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
           'position', aq.position,
           'total', v_attempt.question_count,
           'question_id', aq.question_id,
           'question_version_id', aq.question_version_id,
           'type', v.question_type,
           'stem', v.stem,
           'statements', to_jsonb(v.statements),
           'prompt', v.prompt,
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
           'answered', exists (select 1 from public.attempt_answers aa where aa.attempt_question_id = aq.id),
           'bookmarked', exists (select 1 from public.bookmarks b
                                  where b.question_id = aq.question_id and b.owner_id = v_attempt.owner_id)
         )
    into v_result
    from public.attempt_questions aq
    join content.question_versions v on v.id = aq.question_version_id
   where aq.attempt_id = v_attempt.id
     and aq.position = v_attempt.current_position + 1;

  if v_result is null then
    return jsonb_build_object('position', null, 'total', v_attempt.question_count, 'finished', true);
  end if;

  return v_result;
end;
$$;
