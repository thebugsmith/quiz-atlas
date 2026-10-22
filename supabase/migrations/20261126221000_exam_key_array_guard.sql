-- Fix: to_jsonb(NULL) is JSON null, not SQL NULL, so coalesce did not protect the array
-- walks. Check the JSON type instead, or jsonb_array_elements raises on 'null'.
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
      select 1 from jsonb_array_elements_text(case when jsonb_typeof(p_key -> 'accepted_option_ids') = 'array' then p_key -> 'accepted_option_ids' else '[]'::jsonb end) as a(v)
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
      into v_chosen from jsonb_array_elements_text(case when jsonb_typeof(p_response -> 'option_ids') = 'array' then p_response -> 'option_ids' else '[]'::jsonb end) as v(v);
    select coalesce(array_agg(v.v order by v.v), '{}')
      into v_expected from jsonb_array_elements_text(case when jsonb_typeof(p_key -> 'correct_option_ids') = 'array' then p_key -> 'correct_option_ids' else '[]'::jsonb end) as v(v);

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
      from jsonb_array_elements(case when jsonb_typeof(p_key -> 'accepted_numeric_intervals') = 'array' then p_key -> 'accepted_numeric_intervals' else '[]'::jsonb end) as i
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


revoke all on function public.exam_grade_item(text, jsonb, jsonb, jsonb, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_grade_item(text, jsonb, jsonb, jsonb, jsonb) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exam_grade_item(text, jsonb, jsonb, jsonb, jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_grade_item(text, jsonb, jsonb, jsonb, jsonb) from authenticated;
  end if;
end
$$;
