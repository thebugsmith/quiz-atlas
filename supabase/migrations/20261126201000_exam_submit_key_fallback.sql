-- A draft paper has a draft key. Pin the newest one at submission instead of refusing to
-- grade a development fixture; the pinned id is stored, so the result still says which key
-- produced it.
-- Submit once. Idempotent: a second call returns the stored result, never a second grade.
create or replace function public.exam_submit_attempt(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_rule content.exam_rule_versions%rowtype;
  v_partial jsonb;
  v_display jsonb;
  v_total text := '0';
  v_max numeric := 0;
  v_correct integer := 0;
  v_partial_count integer := 0;
  v_incorrect integer := 0;
  v_unanswered integer := 0;
  v_bonus integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_existing public.exam_results%rowtype;
  v_key uuid;
  rec record;
  v_graded jsonb;
  v_display_total numeric;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into v_existing from public.exam_results where attempt_id = p_attempt_id;
  if found then
    return jsonb_build_object('attempt_id', p_attempt_id, 'already_submitted', true,
                              'total_exact', v_existing.total_exact,
                              'total_display', v_existing.total_display);
  end if;

  if v_attempt.state <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.state using errcode = '22023';
  end if;
  -- The key is pinned at creation when one is published. A draft paper (development
  -- fixture, or a paper still in review) falls back to its newest key and pins it here.
  if v_attempt.key_version_id is null then
    select id into v_key from content.exam_key_versions
     where paper_id = v_attempt.paper_id
     order by (status = 'published') desc, version_number desc limit 1;
    if v_key is null then
      raise exception 'key_missing' using errcode = '22023';
    end if;
    update public.exam_attempts set key_version_id = v_key where id = p_attempt_id;
    v_attempt.key_version_id := v_key;
  end if;

  select * into v_rule from content.exam_rule_versions where id = v_attempt.rule_version_id;
  v_partial := coalesce(v_rule.marking -> 'partial', '{"policy":"none"}'::jsonb);
  v_display := coalesce(v_rule.display, '{"rounding":"none","places":0}'::jsonb);

  for rec in
    select ai.id, ai.position, ai.item_type, ai.prompt, ai.marking,
           ai.options, ai.input_policy, ai.section_subject, ai.question_id,
           r.response,
           ki.accepted_option_ids,
           coalesce(
             ki.correct_option_ids,
             case when qv.correct_option_id is not null
                  then array[qv.correct_option_id::text] end
           ) as correct_option_ids,
           ki.accepted_numeric_intervals,
           ki.exceptional_policy,
           qv.correct_option_id as legacy_correct_id
      from public.exam_attempt_items ai
      left join public.exam_responses r
        on r.attempt_id = ai.attempt_id and r.attempt_item_id = ai.id
      left join public.exam_key_items ki
        on ki.key_version_id = v_attempt.key_version_id and ki.item_version_id = ai.item_version_id
      left join content.question_versions qv on qv.id = (
        select q.current_version_id from content.questions q where q.id = ai.question_id
      )
     where ai.attempt_id = p_attempt_id
     order by ai.position
  loop
    -- Typed papers key their items in exam_key_items; a paper imported through the quiz
    -- importer keeps its key on the question version. Either way an item with no answer
    -- refuses to be graded rather than scoring zero silently.
    if coalesce(array_length(rec.accepted_option_ids, 1), 0) = 0
       and coalesce(array_length(rec.correct_option_ids, 1), 0) = 0
       and rec.accepted_numeric_intervals is null
       and rec.exceptional_policy is null then
      raise exception 'key_missing_for_item:%', rec.position using errcode = '22023';
    end if;

    v_graded := public.exam_grade_item(
      rec.item_type,
      rec.marking,
      rec.response,
      jsonb_build_object(
        'accepted_option_ids', to_jsonb(rec.accepted_option_ids),
        'correct_option_ids', to_jsonb(rec.correct_option_ids),
        'accepted_numeric_intervals', rec.accepted_numeric_intervals,
        'exceptional_policy', rec.exceptional_policy
      ),
      v_partial
    );

    v_total := public.exam_rational_add(v_total, v_graded ->> 'award');
    if coalesce((v_graded ->> 'assessed')::boolean, true) then
      v_max := v_max + public.exam_rational_value(coalesce(rec.marking ->> 'correct', '1'));
    end if;
    v_correct := v_correct + case when v_graded ->> 'status' = 'correct' then 1 else 0 end;
    v_partial_count := v_partial_count + case when v_graded ->> 'status' = 'partial' then 1 else 0 end;
    v_incorrect := v_incorrect + case when v_graded ->> 'status' = 'incorrect' then 1 else 0 end;
    v_unanswered := v_unanswered + case when v_graded ->> 'status' = 'unanswered' then 1 else 0 end;
    v_bonus := v_bonus + case when v_graded ->> 'status' = 'bonus' then 1 else 0 end;

    v_items := v_items || jsonb_build_object(
      'position', rec.position,
      'section', rec.section_subject,
      'type', rec.item_type,
      'prompt', rec.prompt,
      'response', rec.response,
      'status', v_graded ->> 'status',
      'award', v_graded ->> 'award',
      'correct_answer', v_graded -> 'correct_answer'
    );
  end loop;

  v_display_total := round(public.exam_rational_value(v_total), coalesce((v_display ->> 'places')::int, 0));
  if (v_display ->> 'rounding') = 'none' then
    v_display_total := trunc(public.exam_rational_value(v_total) * power(10, coalesce((v_display ->> 'places')::int, 0)))
      / power(10, coalesce((v_display ->> 'places')::int, 0));
  end if;

  insert into public.exam_results
    (attempt_id, total_exact, total_display, max_marks, correct_count, partial_count,
     incorrect_count, unanswered_count, bonus_count, breakdown)
  values
    (p_attempt_id, v_total, v_display_total, v_max, v_correct, v_partial_count,
     v_incorrect, v_unanswered, v_bonus, v_items);

  update public.exam_attempts
     set state = 'submitted', submitted_at = now(), updated_at = now()
   where id = p_attempt_id;

  return jsonb_build_object(
    'attempt_id', p_attempt_id, 'already_submitted', false,
    'total_exact', v_total, 'total_display', v_display_total,
    'correct', v_correct, 'partial', v_partial_count, 'incorrect', v_incorrect,
    'unanswered', v_unanswered, 'bonus', v_bonus);
end;
$$;


revoke all on function public.exam_submit_attempt(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_submit_attempt(uuid, uuid) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exam_submit_attempt(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_submit_attempt(uuid, uuid) from authenticated;
  end if;
end
$$;
