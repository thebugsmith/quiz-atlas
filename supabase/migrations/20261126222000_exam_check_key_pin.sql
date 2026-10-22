-- Fix: a study attempt created before its key was pinned had no key, so checking returned
-- "incorrect" with an empty answer. Resolve the newest key and pin it on first feedback.
/** The answer and, when it exists, the explanation for one item. */
create or replace function public.exam_item_answer(p_attempt_id uuid, p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, content, pg_temp
as $$
  select jsonb_build_object(
           'accepted_option_ids', to_jsonb(ki.accepted_option_ids),
           'correct_option_ids', to_jsonb(ki.correct_option_ids),
           'accepted_numeric_intervals', ki.accepted_numeric_intervals,
           'exceptional_policy', ki.exceptional_policy,
           'explanation', coalesce(v.explanation, qv.explanation)
         )
    from public.exam_attempts a
    join public.exam_attempt_items ai on ai.id = p_item_id and ai.attempt_id = a.id
    left join content.exam_key_items ki
      on ki.key_version_id = coalesce(
         a.key_version_id,
         (select k.id from content.exam_key_versions k
           where k.paper_id = a.paper_id
           order by (k.status = 'published') desc, k.version_number desc limit 1)
       )
       and ki.item_version_id = ai.item_version_id
    left join content.exam_item_versions v on v.id = ai.item_version_id
    left join content.question_versions qv on qv.id = (
      select q.current_version_id from content.questions q where q.id = ai.question_id
    )
   where a.id = p_attempt_id;
$$;

/** Check the current answer. Study only; a timed paper gives nothing away before submit. */
create or replace function public.exam_check_item(
  p_attempt_id uuid, p_owner uuid, p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_item public.exam_attempt_items%rowtype;
  v_response jsonb;
  v_answer jsonb;
  v_graded jsonb;
  v_rule content.exam_rule_versions%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.mode <> 'study' or v_attempt.state <> 'active' then
    raise exception 'feedback_not_allowed' using errcode = '22023';
  end if;

  select * into v_item from public.exam_attempt_items
   where id = p_item_id and attempt_id = p_attempt_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select response into v_response from public.exam_responses
   where attempt_id = p_attempt_id and attempt_item_id = p_item_id;
  if v_response is null then
    raise exception 'no_response' using errcode = '22023';
  end if;

  -- A paper still in review has a draft key. Pin the newest one the first time feedback is
  -- requested, so the marking shown is the marking a submission would use.
  if v_attempt.key_version_id is null then
    update public.exam_attempts a
       set key_version_id = (
             select k.id from content.exam_key_versions k
              where k.paper_id = a.paper_id
              order by (k.status = 'published') desc, k.version_number desc limit 1)
     where a.id = p_attempt_id
     returning * into v_attempt;
  end if;

  select * into v_rule from content.exam_rule_versions where id = v_attempt.rule_version_id;
  v_answer := public.exam_item_answer(p_attempt_id, p_item_id);

  v_graded := public.exam_grade_item(
    v_item.item_type, v_item.marking, v_response,
    jsonb_build_object(
      'accepted_option_ids', v_answer -> 'accepted_option_ids',
      'correct_option_ids', v_answer -> 'correct_option_ids',
      'accepted_numeric_intervals', v_answer -> 'accepted_numeric_intervals',
      'exceptional_policy', v_answer -> 'exceptional_policy'
    ),
    coalesce(v_rule.marking -> 'partial', '{"policy":"none"}'::jsonb)
  );

  -- First unaided answer: kept once, never overwritten by a later edit.
  insert into public.exam_responses (attempt_id, attempt_item_id, visited, first_unaided, checked_at, updated_at)
  values (p_attempt_id, p_item_id, true, v_response, now(), now())
  on conflict (attempt_id, attempt_item_id) do update set
    first_unaided = coalesce(public.exam_responses.first_unaided, v_response),
    checked_at = coalesce(public.exam_responses.checked_at, now()),
    updated_at = now();

  return jsonb_build_object(
    'item_id', p_item_id,
    'status', v_graded ->> 'status',
    'award', v_graded ->> 'award',
    'correct_answer', jsonb_build_object(
      'accepted_option_ids', v_answer -> 'accepted_option_ids',
      'correct_option_ids', v_answer -> 'correct_option_ids',
      'accepted_numeric_intervals', v_answer -> 'accepted_numeric_intervals',
      'exceptional_policy', v_answer -> 'exceptional_policy'
    ),
    'explanation', v_answer ->> 'explanation',
    'editorial_note', 'The explanation is editorial unless the source paper printed one.'
  );
end;
$$;


revoke all on function public.exam_item_answer(uuid, uuid) from public;
revoke all on function public.exam_check_item(uuid, uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_item_answer(uuid, uuid) to service_role;
    grant execute on function public.exam_check_item(uuid, uuid, uuid) to service_role;
  end if;
end
$$;
