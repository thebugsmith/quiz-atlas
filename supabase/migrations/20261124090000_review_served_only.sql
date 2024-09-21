-- Review shows only the questions the player actually met.
--
-- Survival and Time Rush build a pool up front (up to 100 questions) but a run can end
-- after three lives or on the deadline, so most of that pool was never served. The old
-- review joined with a left join and printed the whole pool at the end of the run.

CREATE OR REPLACE FUNCTION public.game_attempt_review(p_attempt_id uuid, p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
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
        join public.attempt_answers aa on aa.attempt_question_id = aq.id
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
$function$;
