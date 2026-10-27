-- A paper whose key came in with the legacy importer is not "missing" its key.
--
-- `exam_paper_detail` already reports `embedded` when the answers live in
-- `paper_questions`, but `exam_catalog` only counted `exam_key_versions`, so the library
-- card said "No key yet" for a paper the solver could grade. Both reads now use the same
-- order: published key version, draft key version, key embedded in the paper, missing.

CREATE OR REPLACE FUNCTION public.exam_catalog()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
  with paper_rows as (
    select
      p.id,
      p.slug,
      p.year,
      p.paper_code,
      p.paper_label,
      p.session_label,
      p.shift_label,
      p.administration,
      p.status,
      p.source_status,
      p.supported_types,
      coalesce(p.question_count, (select count(*)::int
                                    from content.paper_manifest_items mi
                                   where mi.paper_id = p.id)) as question_count,
      p.duration_seconds,
      p.marks_correct,
      p.marks_wrong,
      p.max_marks,
      e.slug as exam_slug,
      e.name as exam_name,
      e.id as exam_id,
      ed.code as edition_code,
      ed.label as edition_label,
      st.code as stage_code,
      st.name as stage_name,
      (select count(*)::int from content.exam_key_versions k
        where k.paper_id = p.id and k.status = 'published') as published_keys,
      (select count(*)::int from content.exam_key_versions k
        where k.paper_id = p.id) as any_keys,
      (select count(*)::int from content.paper_questions pq
        where pq.paper_id = p.id) as legacy_items,
      (select coalesce(array_agg(l.locale order by l.locale), '{}')
         from content.paper_locales l
        where l.paper_id = p.id and l.status in ('reviewed', 'official')) as reviewed_locales
    from content.papers p
    join content.exams e on e.id = p.exam_id
    left join content.exam_editions ed on ed.id = p.edition_id
    left join content.exam_stages st on st.id = p.stage_id
    where p.status <> 'archived'
  )
  select coalesce(jsonb_agg(exam order by exam ->> 'sort_order', exam ->> 'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'slug', e.slug,
        'name', e.name,
        'family', e.family,
        'sort_order', e.sort_order,
        'authority', a.name,
        'editions', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'code', ed.code, 'label', ed.label,
                   'held_from', ed.held_from, 'held_to', ed.held_to
                 ) order by ed.code desc)
            from content.exam_editions ed where ed.exam_id = e.id
        ), '[]'::jsonb),
        'papers', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'slug', pr.slug,
                   'year', pr.year,
                   'paper_code', pr.paper_code,
                   'paper_label', pr.paper_label,
                   'session_label', pr.session_label,
                   'shift_label', pr.shift_label,
                   'administration', pr.administration,
                   'status', pr.status,
                   'source_status', pr.source_status,
                   'supported_types', pr.supported_types,
                   'question_count', pr.question_count,
                   'duration_seconds', pr.duration_seconds,
                   'marks_correct', pr.marks_correct,
                   'marks_wrong', pr.marks_wrong,
                   'max_marks', pr.max_marks,
                   'edition', pr.edition_label,
                   'edition_code', pr.edition_code,
                   'stage', pr.stage_name,
                   'key_status', case
                     when pr.published_keys > 0 then 'published'
                     when pr.any_keys > 0 then 'draft'
                     when pr.legacy_items > 0 then 'embedded'
                     else 'missing' end,
                   'locales', pr.reviewed_locales
                 ) order by pr.year desc, pr.paper_code, pr.shift_label)
            from paper_rows pr where pr.exam_id = e.id
        ), '[]'::jsonb)
      ) as exam
      from content.exams e
      left join content.exam_authorities a on a.id = e.authority_id
      where e.is_active
    ) exams;
$function$;
