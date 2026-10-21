-- Fix: raising after finalizing rolled the finalization back, so an expired attempt stayed
-- active. The refusal now returns a payload the route maps to 409, and the finalized state
-- commits with it.
-- Edits are refused after the deadline, and the attempt is finalized in the same
-- transaction rather than left half-open. An accepted retry keeps its earlier success.
create or replace function public.exam_set_response(
  p_attempt_id uuid,
  p_owner uuid,
  p_item_id uuid,
  p_response jsonb,
  p_expected_revision integer,
  p_mutation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_item public.exam_attempt_items%rowtype;
  v_current integer;
  v_hash text;
  v_mutation public.exam_mutations%rowtype;
  v_revision integer;
  v_cleared boolean;
  v_stored jsonb;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found or v_attempt.owner_id <> p_owner then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_hash := md5(coalesce(p_response::text, 'null') || '|' || p_item_id::text);

  -- A retry of an edit accepted before the deadline still returns its own success.
  select * into v_mutation from public.exam_mutations
   where attempt_id = p_attempt_id and mutation_key = p_mutation_key;
  if found then
    if v_mutation.payload_hash <> v_hash then
      raise exception 'idempotency_mismatch' using errcode = '22023';
    end if;
    return v_mutation.result;
  end if;

  if v_attempt.state <> 'active' then
    raise exception 'attempt_not_active:%', v_attempt.state using errcode = '22023';
  end if;

  if v_attempt.mode = 'timed'
     and v_attempt.deadline_at is not null
     and now() > v_attempt.deadline_at then
    -- Close the paper first, then refuse. Returning instead of raising keeps the
    -- finalization: an exception would roll the whole statement back and leave the
    -- attempt active forever.
    perform public.exam_finalize_attempt(p_attempt_id);
    return jsonb_build_object(
      'error', 'deadline_passed',
      'attempt_id', p_attempt_id,
      'state', 'submitted',
      'mutation_key', p_mutation_key);
  end if;

  select * into v_item from public.exam_attempt_items
   where id = p_item_id and attempt_id = p_attempt_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not public.exam_response_is_valid(v_item.item_type, v_item.options, v_item.input_policy, p_response) then
    raise exception 'invalid_response' using errcode = '22023';
  end if;

  v_cleared := p_response is null
    or ((p_response ->> 'kind') = 'single' and (p_response ->> 'option_id') is null)
    or ((p_response ->> 'kind') = 'multiple' and (p_response -> 'option_ids') = '[]'::jsonb)
    or ((p_response ->> 'kind') = 'numerical' and (p_response ->> 'value') is null);

  v_stored := case when v_cleared then null else p_response end;

  select coalesce(revision, 0) into v_current from public.exam_responses
   where attempt_id = p_attempt_id and attempt_item_id = p_item_id;
  v_current := coalesce(v_current, 0);

  if v_current <> p_expected_revision then
    raise exception 'stale_revision:%', v_current using errcode = '22023';
  end if;

  insert into public.exam_responses
    (attempt_id, attempt_item_id, revision, response, visited, updated_at)
  values (p_attempt_id, p_item_id, v_current + 1, v_stored, true, now())
  on conflict (attempt_id, attempt_item_id) do update set
    revision = public.exam_responses.revision + 1,
    response = excluded.response,
    visited = true,
    updated_at = now()
  returning revision into v_revision;

  update public.exam_attempts set updated_at = now() where id = p_attempt_id;

  insert into public.exam_mutations (attempt_id, mutation_key, payload_hash, result)
  values (
    p_attempt_id, p_mutation_key, v_hash,
    jsonb_build_object('item_id', p_item_id, 'revision', v_revision, 'response', v_stored,
                       'saved_at', now()))
  on conflict (attempt_id, mutation_key) do nothing;

  return jsonb_build_object(
    'item_id', p_item_id, 'revision', v_revision, 'response', v_stored, 'saved_at', now());
end;
$$;

