-- A paper imported by the legacy path was graded +1 / 0 regardless of its own marks.
--
-- The attempt items carry a marking snapshot taken from the typed paper's per-item marks,
-- else the rule version's marking. A legacy paper has neither, so the snapshot was NULL and
-- grading fell back to the defaults inside `exam_grade_item`: one mark for a right answer and
-- nothing for a wrong one. NEET (+4 / -1) therefore showed "0 / 33" and a wrong answer cost
-- nothing, and the CGPSC pilot's "2 marks" were two correct answers at one mark each.
--
-- The snapshot now falls back to the paper's own columns, converted to the rational strings a
-- rule expects ("4", "-1", and "-67/100" for the two-decimal -0.67 the CGPSC import recorded).
-- Attempts created before this migration keep their stored snapshot and are not regraded.

create or replace function content.rational_from_numeric(p_value numeric)
returns text
language sql
immutable
as $$
  select case
    when p_value is null then '0'
    when p_value = trunc(p_value) then trunc(p_value)::int::text
    else (p_value * 100)::int::text || '/100'
  end
$$;

CREATE OR REPLACE FUNCTION public.exam_create_or_resume(p_owner uuid, p_paper_slug text, p_mode exam_attempt_mode, p_create_key text, p_locale text DEFAULT 'en'::text, p_allow_draft boolean DEFAULT false, p_section_ids uuid[] DEFAULT NULL::uuid[])
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
    coalesce(m.marking, v_rule_marking,
      jsonb_build_object(
        'correct', content.rational_from_numeric(v_paper.marks_correct),
        'incorrect', content.rational_from_numeric(coalesce(v_paper.marks_wrong, 0)),
        'unattempted', '0'))
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

CREATE OR REPLACE FUNCTION public.exam_create_timed_attempt(p_owner uuid, p_paper_slug text, p_create_key text, p_locale text DEFAULT 'en'::text, p_section_ids uuid[] DEFAULT NULL::uuid[])
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
    coalesce(m.marking, v_rule.marking,
      jsonb_build_object(
        'correct', content.rational_from_numeric(v_paper.marks_correct),
        'incorrect', content.rational_from_numeric(coalesce(v_paper.marks_wrong, 0)),
        'unattempted', '0'))
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

revoke all on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean, uuid[]) from public;
revoke all on function public.exam_create_timed_attempt(uuid, text, text, text, uuid[]) from public;
revoke all on function content.rational_from_numeric(numeric) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean, uuid[]) to service_role;
    grant execute on function public.exam_create_timed_attempt(uuid, text, text, text, uuid[]) to service_role;
    grant execute on function content.rational_from_numeric(numeric) to service_role;
  end if;
end $$;

-- Attempts opened before this migration carry a NULL snapshot too: fill them with the paper's
-- marks so an unfinished sitting is graded on the same terms as a new one. Submitted results
-- are untouched; a regrade is a separate, explicit action.
update public.exam_attempt_items ai
   set marking = jsonb_build_object(
         'correct', content.rational_from_numeric(p.marks_correct),
         'incorrect', content.rational_from_numeric(coalesce(p.marks_wrong, 0)),
         'unattempted', '0')
  from public.exam_attempts a
  join content.papers p on p.id = a.paper_id
 where ai.attempt_id = a.id
   and ai.marking is null
   and ai.question_id is not null
   and a.state = 'active';
