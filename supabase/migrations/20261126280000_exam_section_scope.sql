-- Exam library: exam tiles, and starting part of a paper.
--
-- Two additions the navigation needs:
--
--  * `exam_catalog` now carries the summary an exam tile shows (paper count, years, how many
--    questions exist) so the list of exams is one read and no longer has to enumerate papers.
--  * `exam_paper_detail` returns each section's id, and both create functions accept those
--    ids, so a player can practise one subject of a paper instead of all 155 items.
--
-- The scope is applied when the attempt is created: only the chosen sections' items are
-- copied into `exam_attempt_items`. A null scope keeps the old behaviour (every item), an
-- empty array or an id from another paper is refused with `invalid_section`, and an existing
-- attempt in the same mode is still resumed rather than duplicated.

drop function if exists public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean);
drop function if exists public.exam_create_timed_attempt(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.exam_create_or_resume(p_owner uuid, p_paper_slug text, p_mode exam_attempt_mode, p_create_key text, p_locale text DEFAULT 'en'::text, p_allow_draft boolean DEFAULT false, p_section_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
declare
  v_paper content.papers%rowtype;
  v_attempt public.exam_attempts%rowtype;
  v_existing public.exam_attempts%rowtype;
  v_rule uuid;
  v_rule_marking jsonb;
  v_key uuid;
  v_version uuid;
  v_items integer := 0;
  v_scope integer;
begin
  if p_mode <> 'study' then
    raise exception 'unsupported_mode' using errcode = '22023';
  end if;

  select * into v_paper from content.papers where slug = p_paper_slug and status <> 'archived';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_section_ids is not null then
    if cardinality(p_section_ids) = 0 then
      raise exception 'invalid_section' using errcode = '22023';
    end if;
    select count(*)::int into v_scope
      from content.paper_sections s
     where s.paper_id = v_paper.id and s.id = any(p_section_ids);
    if v_scope <> cardinality(p_section_ids) then
      raise exception 'invalid_section' using errcode = '22023';
    end if;
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

  select id, marking into v_rule, v_rule_marking
    from content.exam_rule_versions
   where paper_id = v_paper.id
   order by (status = 'published') desc, version_number desc limit 1;
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
     prompt, stem, statements, options, input_policy, stimulus, stimulus_kind, media_path, marking)
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
    stim.media_path,
    coalesce(m.marking, v_rule_marking)
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
    and (p_section_ids is null or m.section_id = any(p_section_ids))
  order by m.position;

  get diagnostics v_items = row_count;
  if v_items = 0 then
    raise exception 'paper_has_no_items' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'created', true, 'state', v_attempt.state,
    'mode', v_attempt.mode, 'paper', p_paper_slug, 'items', v_items);
end;
$function$;

CREATE OR REPLACE FUNCTION public.exam_create_timed_attempt(p_owner uuid, p_paper_slug text, p_create_key text, p_locale text DEFAULT 'en'::text, p_section_ids uuid[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
declare
  v_paper content.papers%rowtype;
  v_rule content.exam_rule_versions%rowtype;
  v_key uuid;
  v_version uuid;
  v_duration integer;
  v_attempt public.exam_attempts%rowtype;
  v_existing public.exam_attempts%rowtype;
  v_items integer := 0;
  v_scope integer;
begin
  select * into v_paper from content.papers where slug = p_paper_slug and status <> 'archived';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_section_ids is not null then
    if cardinality(p_section_ids) = 0 then
      raise exception 'invalid_section' using errcode = '22023';
    end if;
    select count(*)::int into v_scope
      from content.paper_sections s
     where s.paper_id = v_paper.id and s.id = any(p_section_ids);
    if v_scope <> cardinality(p_section_ids) then
      raise exception 'invalid_section' using errcode = '22023';
    end if;
  end if;
  if v_paper.status <> 'published' then
    raise exception 'paper_not_published' using errcode = '22023';
  end if;

  select * into v_existing from public.exam_attempts
   where owner_id = p_owner and create_key = p_create_key;
  if found then
    return jsonb_build_object(
      'attempt_id', v_existing.id, 'created', false, 'state', v_existing.state,
      'mode', v_existing.mode, 'paper', p_paper_slug, 'deadline_at', v_existing.deadline_at);
  end if;

  select * into v_rule from content.exam_rule_versions
   where paper_id = v_paper.id
   order by (status = 'published') desc, version_number desc limit 1;
  if not found then
    raise exception 'rules_missing' using errcode = '22023';
  end if;
  if coalesce(v_rule.timing ->> 'kind', 'whole_paper') <> 'whole_paper' then
    raise exception 'unsupported_timing' using errcode = '22023';
  end if;

  v_duration := coalesce((v_rule.timing ->> 'duration_seconds')::int, v_paper.duration_seconds);
  if v_duration is null or v_duration <= 0 then
    raise exception 'duration_missing' using errcode = '22023';
  end if;

  select id into v_key from content.exam_key_versions
   where paper_id = v_paper.id order by (status = 'published') desc, version_number desc limit 1;
  select id into v_version from content.paper_versions
   where paper_id = v_paper.id and status = 'published' order by version_number desc limit 1;

  insert into public.exam_attempts
    (owner_id, paper_id, paper_version_id, rule_version_id, key_version_id, mode, state,
     locale, create_key, started_at, deadline_at)
  values
    (p_owner, v_paper.id, v_version, v_rule.id, v_key, 'timed', 'active', p_locale,
     p_create_key, now(), now() + make_interval(secs => v_duration))
  returning * into v_attempt;

  insert into public.exam_attempt_items
    (attempt_id, position, section_subject, question_id, item_version_id, item_type,
     prompt, stem, statements, options, input_policy, stimulus, stimulus_kind, media_path, marking)
  select
    v_attempt.id, m.position, s.subject, m.question_id, m.item_version_id, m.item_type,
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
      '[]'::jsonb),
    v.input_policy,
    stim.body, st.kind, stim.media_path,
    coalesce(m.marking, v_rule.marking)
  from content.paper_manifest_items m
  left join content.paper_sections s on s.id = m.section_id
  left join content.exam_item_versions v on v.id = m.item_version_id
  left join content.question_versions qv on qv.id = (
    select q.current_version_id from content.questions q where q.id = m.question_id
  )
  left join content.exam_stimuli st on st.id = v.stimulus_id
  left join content.exam_stimulus_versions stim on stim.id = (
    select l.current_version_id from content.exam_stimulus_localizations l
     where l.stimulus_id = st.id and l.locale = 'en'
  )
  where m.paper_id = v_paper.id
    and (p_section_ids is null or m.section_id = any(p_section_ids))
  order by m.position;

  get diagnostics v_items = row_count;
  if v_items = 0 then
    raise exception 'paper_has_no_items' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'created', true, 'state', v_attempt.state,
    'mode', v_attempt.mode, 'paper', p_paper_slug, 'items', v_items,
    'deadline_at', v_attempt.deadline_at);
end;
$function$;

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
        'paper_count', (select count(*)::int from paper_rows pr where pr.exam_id = e.id),
        'years', coalesce((
          select jsonb_agg(y order by y desc)
            from (select distinct pr.year as y from paper_rows pr where pr.exam_id = e.id) ys
        ), '[]'::jsonb),
        'question_count', coalesce((
          select sum(pr.question_count)::int from paper_rows pr where pr.exam_id = e.id
        ), 0),
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

CREATE OR REPLACE FUNCTION public.exam_paper_detail(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'slug', p.slug,
    'year', p.year,
    'paper_code', p.paper_code,
    'paper_label', p.paper_label,
    'shift_label', p.shift_label,
    'session_label', p.session_label,
    'exam_date', p.exam_date,
    'administration', p.administration,
    'status', p.status,
    'source_status', p.source_status,
    'supported_types', p.supported_types,
    'question_count', coalesce(p.question_count, (select count(*)::int
                                                    from content.paper_manifest_items mi
                                                   where mi.paper_id = p.id)),
    'duration_seconds', p.duration_seconds,
    'marks_correct', p.marks_correct,
    'marks_wrong', p.marks_wrong,
    'max_marks', p.max_marks,
    'exam', jsonb_build_object('slug', e.slug, 'name', e.name, 'family', e.family),
    'authority', a.name,
    'edition', case when ed.id is null then null
                    else jsonb_build_object('code', ed.code, 'label', ed.label) end,
    'stage', case when st.id is null then null
                  else jsonb_build_object('code', st.code, 'name', st.name) end,
    'key_status', case
      when exists (select 1 from content.exam_key_versions k
                    where k.paper_id = p.id and k.status = 'published') then 'published'
      when exists (select 1 from content.exam_key_versions k
                    where k.paper_id = p.id) then 'draft'
      when exists (select 1 from content.paper_questions pq where pq.paper_id = p.id) then 'embedded'
      else 'missing' end,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'subject', s.subject, 'position', s.position,
               'items', (select count(*)::int from content.paper_manifest_items mi
                          where mi.paper_id = p.id and mi.section_id = s.id)
             ) order by s.position)
        from content.paper_sections s where s.paper_id = p.id
    ), '[]'::jsonb),
    'items', (select count(*)::int from content.paper_manifest_items mi where mi.paper_id = p.id),
    'locales', coalesce((
      select jsonb_agg(jsonb_build_object('locale', l.locale, 'status', l.status) order by l.locale)
        from content.paper_locales l where l.paper_id = p.id
    ), '[]'::jsonb),
    'rule', (
      select jsonb_build_object(
               'timing', r.timing, 'marking', r.marking, 'navigation', r.navigation,
               'choices', r.choices, 'display', r.display, 'status', r.status,
               'version', r.version_number
             )
        from content.exam_rule_versions r
       where r.paper_id = p.id
       order by (r.status = 'published') desc, r.version_number desc
       limit 1
    )
  )
  from content.papers p
  join content.exams e on e.id = p.exam_id
  left join content.exam_authorities a on a.id = e.authority_id
  left join content.exam_editions ed on ed.id = p.edition_id
  left join content.exam_stages st on st.id = p.stage_id
  where p.slug = p_slug and p.status <> 'archived';
$function$;

revoke all on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean, uuid[]) from public;
revoke all on function public.exam_create_timed_attempt(uuid, text, text, text, uuid[]) from public;
revoke all on function public.exam_catalog() from public;
revoke all on function public.exam_paper_detail(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean, uuid[]) to service_role;
    grant execute on function public.exam_create_timed_attempt(uuid, text, text, text, uuid[]) to service_role;
    grant execute on function public.exam_catalog() to service_role;
    grant execute on function public.exam_paper_detail(text) to service_role;
  end if;
end $$;
