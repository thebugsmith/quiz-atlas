-- Player progress: history, topic accuracy, configuration-specific personal bests,
-- the UTC participation streak and a small achievement set.
--
-- Everything is derived from accepted answers, so nothing has to be rebuilt when a
-- rule changes and repeated reads cannot double-count. Achievements are the only
-- stored rows, and they are inserted with `on conflict do nothing`.

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_key text not null check (achievement_key in ('first_quiz', 'correct_100', 'active_days_7')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

alter table public.user_achievements enable row level security;

create policy user_achievements_select_own on public.user_achievements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Attempts that may count for progress: practice and reveal are never competitive.
create or replace function public.game_progress(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_completed integer;
  v_answered integer;
  v_correct integer;
  v_skipped integer;
  v_revealed integer;
  v_topics jsonb;
  v_recent jsonb;
  v_bests jsonb;
  v_days date[];
  v_current integer := 0;
  v_longest integer := 0;
  v_run integer := 0;
  v_prev date;
  v_day date;
  v_today date := (now() at time zone 'utc')::date;
  v_unlocked jsonb;
  v_achievements jsonb;
begin
  select count(*) into v_completed
    from public.attempts
   where owner_id = p_owner and mode <> 'practice' and status in ('completed', 'expired');

  select
    count(*) filter (where aa.action = 'answer'),
    count(*) filter (where aa.action = 'answer' and aa.is_correct),
    count(*) filter (where aa.action = 'skip'),
    count(*) filter (where aa.action = 'reveal')
    into v_answered, v_correct, v_skipped, v_revealed
    from public.attempt_answers aa
    join public.attempt_questions aq on aq.id = aa.attempt_question_id
    join public.attempts a on a.id = aq.attempt_id
   where a.owner_id = p_owner and a.mode <> 'practice';

  select coalesce(jsonb_agg(row order by answered desc, name), '[]'::jsonb) into v_topics
    from (
      select jsonb_build_object(
               'slug', t.slug, 'name', t.name,
               'answered', count(*) filter (where aa.action = 'answer'),
               'correct', count(*) filter (where aa.action = 'answer' and aa.is_correct)
             ) as row,
             count(*) filter (where aa.action = 'answer') as answered,
             t.name
        from public.attempt_answers aa
        join public.attempt_questions aq on aq.id = aa.attempt_question_id
        join public.attempts a on a.id = aq.attempt_id
        join content.question_versions v on v.id = aq.question_version_id
        join content.topics t on t.id = v.topic_id
       where a.owner_id = p_owner and a.mode <> 'practice'
       group by t.slug, t.name
      having count(*) filter (where aa.action = 'answer') > 0
    ) rows;

  select coalesce(jsonb_agg(row order by finished_at desc), '[]'::jsonb) into v_recent
    from (
      select jsonb_build_object(
               'id', id, 'mode', mode, 'score', score, 'status', status,
               'question_count', question_count,
               'correct_count', correct_count, 'wrong_count', wrong_count,
               'finished_at', finished_at,
               'topics', coalesce(config -> 'topics', '[]'::jsonb)
             ) as row,
             finished_at
        from public.attempts
       where owner_id = p_owner and mode <> 'practice' and status in ('completed', 'expired', 'abandoned')
       order by coalesce(finished_at, created_at) desc
       limit 8
    ) rows;

  -- Personal bests are per exact configuration, so a 5-question run never competes
  -- with a 20-question one.
  select coalesce(jsonb_agg(row order by best_score desc), '[]'::jsonb) into v_bests
    from (
      select jsonb_build_object(
               'mode', mode,
               'difficulty', coalesce(config ->> 'difficulty', 'mixed'),
               'length', coalesce(config ->> 'durationSeconds', config ->> 'count', '10'),
               'topics', coalesce(config -> 'topics', '[]'::jsonb),
               'best_score', max(score),
               'achieved_at', max(finished_at)
             ) as row,
             max(score) as best_score
        from public.attempts
       where owner_id = p_owner
         and mode <> 'practice'
         and status in ('completed', 'expired')
       group by mode,
                coalesce(config ->> 'difficulty', 'mixed'),
                coalesce(config ->> 'durationSeconds', config ->> 'count', '10'),
                coalesce(config -> 'topics', '[]'::jsonb)
    ) rows;

  -- A UTC day counts when a non-practice attempt finished on it with at least five
  -- submitted answers. Skips and reveals do not reach five on their own.
  select array_agg(day order by day) into v_days
    from (
      select distinct (a.finished_at at time zone 'utc')::date as day
        from public.attempts a
       where a.owner_id = p_owner
         and a.mode in ('classic', 'time_rush', 'survival', 'daily')
         and a.status in ('completed', 'expired')
         and a.finished_at is not null
         and (
           select count(*)
             from public.attempt_answers aa
             join public.attempt_questions aq on aq.id = aa.attempt_question_id
            where aq.attempt_id = a.id and aa.action = 'answer'
         ) >= 5
    ) days;

  if v_days is not null then
    foreach v_day in array v_days loop
      if v_prev is null or v_day = v_prev + 1 then
        v_run := v_run + 1;
      else
        v_run := 1;
      end if;
      if v_run > v_longest then v_longest := v_run; end if;
      v_prev := v_day;
    end loop;

    -- The current streak is alive when the last active day is today or yesterday;
    -- otherwise it has already lapsed.
    if v_prev = v_today or v_prev = v_today - 1 then
      v_current := v_run;
    else
      v_current := 0;
    end if;
  end if;

  select coalesce(jsonb_agg(achievement_key order by unlocked_at), '[]'::jsonb) into v_unlocked
    from public.user_achievements where user_id = p_owner;

  v_achievements := jsonb_build_array(
    jsonb_build_object(
      'key', 'first_quiz', 'name', 'First quiz',
      'description', 'Finish one Classic, Time Rush, Survival or Daily quiz.',
      'progress', least(v_completed, 1), 'target', 1,
      'unlocked', v_completed >= 1
    ),
    jsonb_build_object(
      'key', 'correct_100', 'name', '100 correct answers',
      'description', 'Answer 100 questions correctly outside practice.',
      'progress', least(v_correct, 100), 'target', 100,
      'unlocked', v_correct >= 100
    ),
    jsonb_build_object(
      'key', 'active_days_7', 'name', '7 active days',
      'description', 'Play on seven different UTC days.',
      'progress', least(coalesce(array_length(v_days, 1), 0), 7), 'target', 7,
      'unlocked', coalesce(array_length(v_days, 1), 0) >= 7
    )
  );

  return jsonb_build_object(
    'totals', jsonb_build_object(
      'completed_quizzes', v_completed,
      'answered', v_answered,
      'correct', v_correct,
      'accuracy', case when v_answered = 0 then null else round(v_correct::numeric / v_answered, 4) end,
      'skipped', v_skipped,
      'revealed', v_revealed
    ),
    'topics', v_topics,
    'recent', v_recent,
    'bests', v_bests,
    'streak', jsonb_build_object(
      'current', v_current,
      'longest', v_longest,
      'active_days', coalesce(array_length(v_days, 1), 0),
      'last_day', v_prev,
      'today_utc', v_today
    ),
    'achievements', v_achievements,
    'unlocked', v_unlocked
  );
end;
$$;

revoke all on function public.game_progress(uuid) from public;

/**
 * Awards are insert-only and keyed, so finishing the same attempt twice, reopening a
 * result, or retrying a request cannot unlock anything twice.
 */
create or replace function public.game_award_achievements(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_progress jsonb;
  v_new text[] := '{}';
  v_key text;
begin
  v_progress := public.game_progress(p_owner);

  foreach v_key in array array['first_quiz', 'correct_100', 'active_days_7'] loop
    if exists (
      select 1 from jsonb_array_elements(v_progress -> 'achievements') e
       where e ->> 'key' = v_key and (e ->> 'unlocked')::boolean
    ) then
      insert into public.user_achievements (user_id, achievement_key)
      values (p_owner, v_key)
      on conflict (user_id, achievement_key) do nothing;
      if found then
        v_new := array_append(v_new, v_key);
      end if;
    end if;
  end loop;

  return jsonb_build_object('awarded', to_jsonb(v_new));
end;
$$;

revoke all on function public.game_award_achievements(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.game_progress(uuid) to service_role;
    grant execute on function public.game_award_achievements(uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.game_progress(uuid) from anon;
    revoke all on function public.game_award_achievements(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.game_progress(uuid) from authenticated;
    revoke all on function public.game_award_achievements(uuid) from authenticated;
  end if;
end
$$;
