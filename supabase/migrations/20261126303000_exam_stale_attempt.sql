-- An open workspace must not outlive the paper it was built from.
--
-- `exam_create_or_resume` returned any active study attempt for the owner and paper, however many
-- items it held. A paper that gained slots (the CGPSC import went 92 -> 97 -> 100) therefore
-- showed 100 on its card and 92 in the palette, because the attempt snapshots its items at
-- creation. The attempt now records the section scope it was built with and is retired as
-- `abandoned` when the paper's manifest for that scope no longer matches its item count; the
-- caller gets `replaced` and starts a fresh attempt over the current paper.

alter table public.exam_attempts add column if not exists section_ids uuid[];

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
  v_manifest integer;
  v_replaced uuid;
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
    -- A paper can gain or lose slots between sessions (an import lands, a row is pulled). An
    -- open workspace keeps the items it was built with, so resuming it would hide the change
    -- behind a card that already counts the new paper. Retire it instead; the answers stay
    -- readable through the attempt's own URL.
    select count(*)::int into v_manifest
      from content.paper_manifest_items m
     where m.paper_id = v_paper.id
       and (v_existing.section_ids is null or m.section_id = any (v_existing.section_ids));
    if v_manifest <> (select count(*) from public.exam_attempt_items ai where ai.attempt_id = v_existing.id) then
      update public.exam_attempts
         set state = 'abandoned', updated_at = now()
       where id = v_existing.id;
      v_replaced := v_existing.id;
    else
      return jsonb_build_object(
        'attempt_id', v_existing.id, 'created', false, 'state', v_existing.state,
        'mode', v_existing.mode, 'paper', p_paper_slug);
    end if;
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
     locale, create_key, started_at, section_ids)
  values
    (p_owner, v_paper.id, v_version, v_rule, v_key, p_mode, 'active', p_locale, p_create_key, now(),
     p_section_ids)
  returning * into v_attempt;

  insert into public.exam_attempt_items
    (attempt_id, position, section_subject, question_id, item_version_id, item_type,
     prompt, stem, statements, options, match, input_policy, stimulus, stimulus_kind, media_path, marking)
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
    qv.match,
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
  left join content.exam_item_versions v on v.id = coalesce(
    (select il.current_version_id
       from content.exam_item_localizations il
       join content.exam_item_versions ev on ev.id = m.item_version_id
      where il.item_id = ev.item_id and il.locale = p_locale),
    m.item_version_id)
  left join content.question_versions qv on qv.id = coalesce(
    (select l.current_version_id
       from content.question_localizations l
      where l.question_id = m.question_id and l.locale = p_locale),
    (select l.current_version_id
       from content.question_localizations l
      where l.question_id = m.question_id and l.locale = 'en'),
    (select q.current_version_id from content.questions q where q.id = m.question_id)
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
    'mode', v_attempt.mode, 'paper', p_paper_slug, 'items', v_items, 'replaced', v_replaced);
end;
$function$;

create or replace function public.exam_open_attempt(p_owner uuid, p_paper_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
  select jsonb_build_object(
           'attempt_id', a.id,
           'state', a.state,
           'created_at', a.created_at,
           'answered', (select count(*)::int from public.exam_responses r
                          join public.exam_attempt_items ai on ai.id = r.attempt_item_id
                         where r.attempt_id = a.id and r.response is not null),
           'total', (select count(*)::int from public.exam_attempt_items ai where ai.attempt_id = a.id),
           'cursor_position', (
             select ai.position from public.exam_attempt_items ai
              where ai.id = a.cursor_item_id
           )
         )
    from public.exam_attempts a
    join content.papers p on p.id = a.paper_id
   where a.owner_id = p_owner and p.slug = p_paper_slug
     and a.mode = 'study' and a.state in ('ready', 'active', 'paused')
     and (select count(*) from public.exam_attempt_items ai where ai.attempt_id = a.id)
         = (select count(*) from content.paper_manifest_items m
             where m.paper_id = a.paper_id
               and (a.section_ids is null or m.section_id = any (a.section_ids)))
   limit 1;
$function$;

revoke all on function public.exam_create_or_resume(uuid, text, exam_attempt_mode, text, text, boolean, uuid[]) from public;
revoke all on function public.exam_open_attempt(uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_create_or_resume(uuid, text, exam_attempt_mode, text, text, boolean, uuid[]) to service_role;
    grant execute on function public.exam_open_attempt(uuid, text) to service_role;
  end if;
end $$;
