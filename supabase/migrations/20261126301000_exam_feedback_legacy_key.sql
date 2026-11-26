-- Check answer on a paper whose key lives in the paper, not in a key version.
--
-- `exam_item_answer` returned the key only from `exam_key_items`, so for an imported paper every
-- study check answered "Incorrect" no matter what was chosen. The single-choice grader compares
-- against `accepted_option_ids`, not `correct_option_ids`, so both fields take the paper's own
-- answer here, exactly as the submit path already did.

CREATE OR REPLACE FUNCTION public.exam_item_answer(p_attempt_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
  select jsonb_build_object(
           'accepted_option_ids', coalesce(
             ki.accepted_option_ids,
             case when qv.correct_option_id is not null
                  then array[qv.correct_option_id::text] end
           ),
           'correct_option_ids', coalesce(
             ki.correct_option_ids,
             case when qv.correct_option_id is not null
                  then array[qv.correct_option_id::text] end
           ),
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
$function$;

revoke all on function public.exam_item_answer(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_item_answer(uuid, uuid) to service_role;
  end if;
end $$;
