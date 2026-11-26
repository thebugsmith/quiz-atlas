-- Match-the-following questions: two columns, one answer code.
--
-- `match` holds {"list1": [...], "list2": [...], "labels1": "1|a|i", "labels2": "1|a|i"} on the
-- question version, validated so both columns exist, have the same length and carry no empty
-- entries. It is display only: the answer stays a normal single-choice option (the printed code),
-- so grading, keys and attempts need no new rules.
--
-- The payload is copied into the attempt item (exam) and returned by every read that already
-- returns the stem and statements (exam workspace, exam result, quiz question and quiz review).

create or replace function content.match_is_valid(p_match jsonb)
returns boolean
language sql
immutable
as $$
  select p_match is null or (
    jsonb_typeof(p_match) = 'object'
    and jsonb_typeof(p_match -> 'list1') = 'array'
    and jsonb_typeof(p_match -> 'list2') = 'array'
    and jsonb_array_length(p_match -> 'list1') between 2 and 8
    and jsonb_array_length(p_match -> 'list1') = jsonb_array_length(p_match -> 'list2')
    and not exists (
      select 1 from jsonb_array_elements(p_match -> 'list1') e
       where jsonb_typeof(e) <> 'string'
          or btrim(e #>> '{}') = ''
          or length(e #>> '{}') > 200
    )
    and not exists (
      select 1 from jsonb_array_elements(p_match -> 'list2') e
       where jsonb_typeof(e) <> 'string'
          or btrim(e #>> '{}') = ''
          or length(e #>> '{}') > 200
    )
    and coalesce(p_match ->> 'labels1', '1') in ('1', 'a', 'i')
    and coalesce(p_match ->> 'labels2', 'a') in ('1', 'a', 'i')
  )
$$;

alter table content.question_versions
  add column if not exists match jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'content.question_versions'::regclass
       and conname = 'question_versions_match_valid'
  ) then
    alter table content.question_versions
      add constraint question_versions_match_valid check (content.match_is_valid(match));
  end if;
end $$;

alter table public.exam_attempt_items
  add column if not exists match jsonb;

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
     prompt, stem, statements, options, match, input_policy, stimulus, stimulus_kind, media_path, marking)
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
    qv.match,
    v.input_policy,
    stim.body, st.kind, stim.media_path,
    coalesce(m.marking, v_rule.marking,
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

CREATE OR REPLACE FUNCTION public.exam_submit_attempt(p_attempt_id uuid, p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
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
    -- A paper imported through the quiz importer has no exam key version: its answers live
    -- on the question version and the per-item check decides whether that is enough.
    if v_key is not null then
      update public.exam_attempts set key_version_id = v_key where id = p_attempt_id;
      v_attempt.key_version_id := v_key;
    end if;
  end if;

  select * into v_rule from content.exam_rule_versions where id = v_attempt.rule_version_id;
  v_partial := coalesce(v_rule.marking -> 'partial', '{"policy":"none"}'::jsonb);
  v_display := coalesce(v_rule.display, '{"rounding":"none","places":0}'::jsonb);

  for rec in
    select ai.id, ai.position, ai.item_type, ai.prompt, ai.marking,
           ai.options, ai.match, ai.input_policy, ai.section_subject, ai.question_id,
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
      left join content.exam_key_items ki
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
        -- A legacy single-choice key sits in correct_option_ids; both kinds mean "these are
        -- acceptable answers", and the item type decides how they are graded.
        'accepted_option_ids', to_jsonb(coalesce(rec.accepted_option_ids, rec.correct_option_ids)),
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
      'match', rec.match,
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
$function$;

CREATE OR REPLACE FUNCTION public.exam_attempt_manifest(p_attempt_id uuid, p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
declare
  v_attempt public.exam_attempts%rowtype;
  v_paper content.papers%rowtype;
  v_rule content.exam_rule_versions%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_attempt.state = 'active' and v_attempt.mode = 'timed'
     and v_attempt.deadline_at is not null and now() > v_attempt.deadline_at then
    perform public.exam_finalize_attempt(p_attempt_id);
    select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  end if;

  select * into v_paper from content.papers where id = v_attempt.paper_id;
  if v_attempt.rule_version_id is not null then
    select * into v_rule from content.exam_rule_versions where id = v_attempt.rule_version_id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'mode', v_attempt.mode,
    'state', v_attempt.state,
    'locale', v_attempt.locale,
    'cursor_item_id', v_attempt.cursor_item_id,
    'started_at', v_attempt.started_at,
    'deadline_at', v_attempt.deadline_at,
    'server_now', now(),
    'paper', jsonb_build_object(
      'slug', v_paper.slug, 'label', coalesce(v_paper.paper_label, v_paper.paper_code),
      'year', v_paper.year, 'marks_correct', v_paper.marks_correct,
      'marks_wrong', v_paper.marks_wrong, 'duration_seconds', v_paper.duration_seconds
    ),
    'rule', case when v_rule.id is null then null else jsonb_build_object(
      'timing', v_rule.timing, 'marking', v_rule.marking, 'navigation', v_rule.navigation,
      'choices', v_rule.choices, 'display', v_rule.display, 'version', v_rule.version_number
    ) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'item_id', ai.id, 'position', ai.position, 'section', ai.section_subject,
               'type', ai.item_type, 'prompt', ai.prompt, 'stem', ai.stem,
               'statements', ai.statements, 'match', ai.match,
               'stimulus', case when ai.stimulus is null then null else jsonb_build_object(
                 'kind', ai.stimulus_kind, 'body', ai.stimulus, 'media_path', ai.media_path) end,
               'options', ai.options, 'input', ai.input_policy,
               'response', case when r.attempt_item_id is null then null else jsonb_build_object(
                 'value', r.response, 'revision', r.revision, 'marked', r.marked,
                 'visited', r.visited, 'checked', r.checked_at is not null,
                 'revealed', r.revealed_at is not null) end
             ) order by ai.position)
        from public.exam_attempt_items ai
        left join public.exam_responses r
          on r.attempt_id = ai.attempt_id and r.attempt_item_id = ai.id
       where ai.attempt_id = v_attempt.id
    ), '[]'::jsonb),
    'answered', (
      select count(*)::int from public.exam_responses r
       where r.attempt_id = v_attempt.id and r.response is not null
    ),
    'total', (select count(*)::int from public.exam_attempt_items where attempt_id = v_attempt.id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.game_current_question(p_attempt_id uuid, p_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
           'match', v.match,
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
$function$;

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
               'match', v.match,
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

revoke all on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean, uuid[]) from public;
revoke all on function public.exam_create_timed_attempt(uuid, text, text, text, uuid[]) from public;
revoke all on function public.exam_attempt_manifest(uuid, uuid) from public;
revoke all on function public.exam_submit_attempt(uuid, uuid) from public;
revoke all on function public.game_current_question(uuid, uuid) from public;
revoke all on function public.game_attempt_review(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_create_or_resume(uuid, text, public.exam_attempt_mode, text, text, boolean, uuid[]) to service_role, anon, authenticated;
    grant execute on function public.exam_create_timed_attempt(uuid, text, text, text, uuid[]) to service_role, anon, authenticated;
    grant execute on function public.exam_attempt_manifest(uuid, uuid) to service_role;
    grant execute on function public.exam_submit_attempt(uuid, uuid) to service_role;
    grant execute on function public.game_current_question(uuid, uuid) to service_role, anon, authenticated;
    grant execute on function public.game_attempt_review(uuid, uuid) to service_role, anon, authenticated;
  end if;
end $$;
