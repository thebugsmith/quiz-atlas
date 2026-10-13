-- Fix: wrapping a set-returning function in a bare alias made the element reference
-- resolve to the row rather than the text column, so a multiple-select answer failed with
-- "text = jsonb". Name the column explicitly.
create or replace function public.exam_response_is_valid(
  p_item_type text, p_options jsonb, p_input jsonb, p_response jsonb
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_kind text;
  v_values jsonb;
begin
  if p_response is null then
    return true;
  end if;
  if jsonb_typeof(p_response) <> 'object' then
    return false;
  end if;

  v_kind := p_response ->> 'kind';

  if p_item_type = 'single_choice' then
    if v_kind <> 'single' then return false; end if;
    if p_response ->> 'option_id' is null then return true; end if;
    return exists (
      select 1 from jsonb_array_elements(p_options) as option
       where option ->> 'id' = p_response ->> 'option_id'
    );
  end if;

  if p_item_type = 'multiple_select' then
    if v_kind <> 'multiple' then return false; end if;
    v_values := p_response -> 'option_ids';
    if v_values is null or jsonb_typeof(v_values) <> 'array' then return false; end if;
    if jsonb_array_length(v_values) > 10 then return false; end if;
    if (select count(distinct chosen.v) from jsonb_array_elements_text(v_values) as chosen(v))
       <> jsonb_array_length(v_values) then return false; end if;
    return not exists (
      select 1 from jsonb_array_elements_text(v_values) as chosen(v)
       where not exists (
         select 1 from jsonb_array_elements(p_options) as option
          where option ->> 'id' = chosen.v
       )
    );
  end if;

  if p_item_type = 'numerical' then
    if v_kind <> 'numerical' then return false; end if;
    if p_response ->> 'value' is null then return true; end if;
    if (p_response ->> 'value') !~ '^-?[0-9]{1,9}(\.[0-9]{1,6})?$' then return false; end if;
    if coalesce(p_input ->> 'kind', '') = 'integer'
       and (p_response ->> 'value') !~ '^-?[0-9]{1,9}$' then
      return false;
    end if;
    if coalesce(p_input ->> 'kind', '') = 'decimal'
       and (p_input ->> 'max_decimal_places') is not null
       and (p_response ->> 'value') ~ '\.'
       and char_length(split_part(p_response ->> 'value', '.', 2))
           > (p_input ->> 'max_decimal_places')::int then
      return false;
    end if;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.exam_response_is_valid(text, jsonb, jsonb, jsonb) from public;
