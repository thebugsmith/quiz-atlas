-- Marking: exact, per paper, with a frozen key and frozen per-item marks.
--
-- Marks are rationals held as text ("4", "-1", "-2/3"). Summing them as floating point
-- would round a one-third penalty per question, so the total is accumulated as an exact
-- fraction and only rounded for display, using the paper's own rounding policy.

-- Per-item marks, frozen when the attempt is created.
alter table public.exam_attempt_items
  add column if not exists marking jsonb
    check (marking is null or jsonb_typeof(marking) = 'object');

create table if not exists public.exam_results (
  attempt_id uuid primary key references public.exam_attempts (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  -- Exact total as "numerator/denominator", reduced. Never a float.
  total_exact text not null,
  total_display numeric(8, 2) not null,
  max_marks numeric(8, 2),
  correct_count integer not null default 0,
  partial_count integer not null default 0,
  incorrect_count integer not null default 0,
  unanswered_count integer not null default 0,
  bonus_count integer not null default 0,
  evaluator_version integer not null default 1,
  breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(breakdown) = 'array')
);

alter table public.exam_results enable row level security;

create policy exam_results_select_own on public.exam_results
  for select to authenticated using (
    exists (
      select 1 from public.exam_attempts a
       where a.id = exam_results.attempt_id and a.owner_id = (select auth.uid())
    )
  );

-- "4" or "-2/3" to a numeric pair. Invalid text raises rather than scoring zero.
create or replace function public.exam_rational_parts(p_value text)
returns numeric[]
language plpgsql
immutable
as $$
declare
  v_parts text[];
  v_num numeric;
  v_den numeric;
begin
  if p_value is null or p_value !~ '^-?[0-9]{1,9}(/[1-9][0-9]{0,3})?$' then
    raise exception 'invalid_rational:%', coalesce(p_value, 'null') using errcode = '22023';
  end if;
  v_parts := string_to_array(p_value, '/');
  v_num := v_parts[1]::numeric;
  v_den := coalesce(v_parts[2], '1')::numeric;
  return array[v_num, v_den];
end;
$$;

/** Exact fraction addition, returned reduced as "a/b" (or "a" when the denominator is 1). */
create or replace function public.exam_rational_add(p_left text, p_right text)
returns text
language plpgsql
immutable
as $$
declare
  l numeric[];
  r numeric[];
  num numeric;
  den numeric;
  g numeric;
begin
  l := public.exam_rational_parts(p_left);
  r := public.exam_rational_parts(p_right);
  num := l[1] * r[2] + r[1] * l[2];
  den := l[2] * r[2];
  if num = 0 then
    return '0';
  end if;
  g := greatest(abs(num), abs(den));
  -- Euclid, small numbers only: rules are hand-written, not generated.
  declare
    a numeric := abs(num);
    b numeric := abs(den);
    t numeric;
  begin
    while b <> 0 loop
      t := mod(a, b);
      a := b;
      b := t;
    end loop;
    g := a;
  end;
  num := num / g;
  den := den / g;
  if den = 1 then
    return num::text;
  end if;
  return num::text || '/' || den::text;
end;
$$;

create or replace function public.exam_rational_value(p_value text)
returns numeric
language sql
immutable
as $$
  select (public.exam_rational_parts(p_value))[1] / (public.exam_rational_parts(p_value))[2];
$$;

-- Freeze per-item marks when the attempt is created. Falls back to the paper rule.
create or replace function public.exam_create_or_resume(
  p_owner uuid,
  p_paper_slug text,
  p_mode public.exam_attempt_mode,
  p_create_key text,
  p_locale text default 'en',
  p_allow_draft boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_paper content.papers%rowtype;
  v_attempt public.exam_attempts%rowtype;
  v_existing public.exam_attempts%rowtype;
  v_rule uuid;
  v_rule_marking jsonb;
  v_key uuid;
  v_version uuid;
  v_items integer := 0;
begin
  if p_mode <> 'study' then
    raise exception 'unsupported_mode' using errcode = '22023';
  end if;

  select * into v_paper from content.papers where slug = p_paper_slug and status <> 'archived';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
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
  order by m.position;

  get diagnostics v_items = row_count;
  if v_items = 0 then
    raise exception 'paper_has_no_items' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id, 'created', true, 'state', v_attempt.state,
    'mode', v_attempt.mode, 'paper', p_paper_slug, 'items', v_items);
end;
$$;

-- One item's award. Empty string means the item is not assessed (excluded).
create or replace function public.exam_grade_item(
  p_item_type text,
  p_marking jsonb,
  p_response jsonb,
  p_key jsonb,
  p_partial jsonb
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_marks jsonb := coalesce(p_marking, '{}'::jsonb);
  v_correct text := coalesce(v_marks ->> 'correct', '1');
  v_incorrect text := coalesce(v_marks ->> 'incorrect', '0');
  v_unattempted text := coalesce(v_marks ->> 'unattempted', '0');
  v_policy text := p_key ->> 'exceptional_policy';
  v_chosen text[];
  v_expected text[];
  v_value text;
  v_points text;
  v_hit boolean := false;
  v_status text;
  v_award text;
begin
  -- Cleared answers are stored as NULL, so anything else here is a real response.
  if p_response = 'null'::jsonb then
    p_response := null;
  end if;

  -- A withdrawn or excluded item cannot punish anybody.
  if v_policy in ('award_all', 'exclude') then
    return jsonb_build_object(
      'status', 'bonus', 'award', v_correct, 'assessed', false,
      'correct_answer', p_key - 'exceptional_policy');
  end if;

  if p_response is null then
    return jsonb_build_object(
      'status', 'unanswered', 'award', v_unattempted, 'assessed', true,
      'correct_answer', p_key);
  end if;

  if p_item_type = 'single_choice' then
    v_hit := exists (
      select 1 from jsonb_array_elements_text(coalesce(p_key -> 'accepted_option_ids', '[]'::jsonb)) as a(v)
       where a.v = p_response ->> 'option_id'
    );
    return jsonb_build_object(
      'status', case when v_hit then 'correct' else 'incorrect' end,
      'award', case when v_hit then v_correct else v_incorrect end,
      'assessed', true,
      'correct_answer', p_key);
  end if;

  if p_item_type = 'multiple_select' then
    select coalesce(array_agg(v.v order by v.v), '{}')
      into v_chosen from jsonb_array_elements_text(coalesce(p_response -> 'option_ids', '[]'::jsonb)) as v(v);
    select coalesce(array_agg(v.v order by v.v), '{}')
      into v_expected from jsonb_array_elements_text(coalesce(p_key -> 'correct_option_ids', '[]'::jsonb)) as v(v);

    if v_chosen = v_expected then
      return jsonb_build_object(
        'status', 'correct', 'award', v_correct, 'assessed', true, 'correct_answer', p_key);
    end if;

    -- A subset with no wrong selection can earn partial credit when the paper says so.
    if coalesce(p_partial ->> 'policy', 'none') = 'correct_subset_count'
       and v_chosen <@ v_expected
       and array_length(v_chosen, 1) > 0 then
      v_points := p_partial -> 'points_by_count' ->> array_length(v_chosen, 1)::text;
      if v_points is not null then
        return jsonb_build_object(
          'status', 'partial', 'award', v_points, 'assessed', true, 'correct_answer', p_key);
      end if;
    end if;

    return jsonb_build_object(
      'status', 'incorrect', 'award', v_incorrect, 'assessed', true, 'correct_answer', p_key);
  end if;

  -- Numerical: any accepted interval, comparing as decimals, never as floats.
  v_value := p_response ->> 'value';
  v_hit := exists (
    select 1
      from jsonb_array_elements(coalesce(p_key -> 'accepted_numeric_intervals', '[]'::jsonb)) as i
     where v_value is not null
       and v_value::numeric >= (i ->> 'min')::numeric
       and v_value::numeric <= (i ->> 'max')::numeric
       and (coalesce((i ->> 'min_inclusive')::boolean, true) or v_value::numeric > (i ->> 'min')::numeric)
       and (coalesce((i ->> 'max_inclusive')::boolean, true) or v_value::numeric < (i ->> 'max')::numeric)
  );

  return jsonb_build_object(
    'status', case when v_hit then 'correct' else 'incorrect' end,
    'award', case when v_hit then v_correct else v_incorrect end,
    'assessed', true,
    'correct_answer', p_key);
end;
$$;

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
  if v_attempt.key_version_id is null then
    raise exception 'key_missing' using errcode = '22023';
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

create or replace function public.exam_result(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_result public.exam_results%rowtype;
  v_paper content.papers%rowtype;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into v_result from public.exam_results where attempt_id = p_attempt_id;
  if not found then
    raise exception 'not_submitted' using errcode = 'P0002';
  end if;
  select * into v_paper from content.papers where id = v_attempt.paper_id;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'submitted_at', v_result.submitted_at,
    'total_exact', v_result.total_exact,
    'total_display', v_result.total_display,
    'max_marks', v_result.max_marks,
    'correct', v_result.correct_count,
    'partial', v_result.partial_count,
    'incorrect', v_result.incorrect_count,
    'unanswered', v_result.unanswered_count,
    'bonus', v_result.bonus_count,
    'paper', jsonb_build_object(
      'slug', v_paper.slug, 'label', coalesce(v_paper.paper_label, v_paper.paper_code), 'year', v_paper.year
    ),
    'items', v_result.breakdown
  );
end;
$$;

revoke all on function public.exam_submit_attempt(uuid, uuid) from public;
revoke all on function public.exam_result(uuid, uuid) from public;
revoke all on function public.exam_grade_item(text, jsonb, jsonb, jsonb, jsonb) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.exam_results to service_role;
    grant execute on function public.exam_submit_attempt(uuid, uuid) to service_role;
    grant execute on function public.exam_result(uuid, uuid) to service_role;
    grant execute on function public.exam_grade_item(text, jsonb, jsonb, jsonb, jsonb) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.exam_results from anon;
    revoke all on function public.exam_submit_attempt(uuid, uuid) from anon;
    revoke all on function public.exam_result(uuid, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_submit_attempt(uuid, uuid) from authenticated;
    revoke all on function public.exam_result(uuid, uuid) from authenticated;
  end if;
end
$$;
