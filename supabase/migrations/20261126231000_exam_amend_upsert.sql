-- Fix: an amendment that fills a missing answer used UPDATE, which raised when the item had
-- no key row. It is now an upsert, so an editor can repair an incomplete key version.
/**
 * A key amendment appends a new key version: the previous one is copied and the given
 * items are replaced. Changes are addressed by paper position, so an editor never has to
 * know internal ids. Nothing about an existing result moves.
 */
create or replace function public.exam_admin_amend_key(
  p_actor uuid, p_paper_slug text, p_changes jsonb, p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_role public.admin_role;
  v_paper content.papers%rowtype;
  v_key uuid;
  v_version integer;
  v_change jsonb;
  v_item_version uuid;
  v_position integer;
begin
  v_role := public.admin_role_of(p_actor);
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'invalid_changes' using errcode = '22023';
  end if;

  select * into v_paper from content.papers where slug = p_paper_slug;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select id, version_number into v_key, v_version
    from content.exam_key_versions
   where paper_id = v_paper.id order by version_number desc limit 1;
  if v_key is null then
    raise exception 'key_missing' using errcode = '22023';
  end if;

  insert into content.exam_key_versions
    (paper_id, version_number, status, source_note, published_at, content_hash)
  values
    (v_paper.id, v_version + 1, case when p_publish then 'published' else 'draft' end,
     'amended by admin', case when p_publish then now() end, null)
  returning id into v_key;

  -- Copy every previous answer, then apply the amendments.
  insert into content.exam_key_items
    (paper_id, key_version_id, item_version_id, accepted_option_ids, correct_option_ids,
     accepted_numeric_intervals, exceptional_policy)
  select ki.paper_id, v_key, ki.item_version_id, ki.accepted_option_ids, ki.correct_option_ids,
         ki.accepted_numeric_intervals, ki.exceptional_policy
    from content.exam_key_items ki
   where ki.key_version_id = (
     select id from content.exam_key_versions
      where paper_id = v_paper.id order by version_number desc offset 1 limit 1
   );

  for v_change in select * from jsonb_array_elements(p_changes)
  loop
    v_position := (v_change ->> 'position')::int;
    select item_version_id into v_item_version
      from content.exam_paper_items
     where paper_id = v_paper.id and position = v_position;
    if v_item_version is null then
      raise exception 'unknown_position:%', v_position using errcode = '22023';
    end if;

    -- An amendment can fill a gap as well as change an answer, so this is an upsert.
    insert into content.exam_key_items
      (paper_id, key_version_id, item_version_id, accepted_option_ids, correct_option_ids,
       accepted_numeric_intervals, exceptional_policy)
    values (
      v_paper.id, v_key, v_item_version,
      case when v_change ? 'accepted_option_ids'
           then array(select jsonb_array_elements_text(v_change -> 'accepted_option_ids')) end,
      case when v_change ? 'correct_option_ids'
           then array(select jsonb_array_elements_text(v_change -> 'correct_option_ids')) end,
      v_change -> 'accepted_numeric_intervals',
      v_change ->> 'exceptional_policy'
    )
    on conflict (key_version_id, item_version_id) do update set
      accepted_option_ids = coalesce(excluded.accepted_option_ids, content.exam_key_items.accepted_option_ids),
      correct_option_ids = coalesce(excluded.correct_option_ids, content.exam_key_items.correct_option_ids),
      accepted_numeric_intervals = coalesce(excluded.accepted_numeric_intervals, content.exam_key_items.accepted_numeric_intervals),
      exceptional_policy = coalesce(excluded.exceptional_policy, content.exam_key_items.exceptional_policy);
  end loop;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'exam_key_amend', 'paper', v_paper.id,
          jsonb_build_object('key_version', v_version + 1, 'changes', jsonb_array_length(p_changes)));

  return jsonb_build_object('paper', p_paper_slug, 'key_version', v_version + 1);
end;
$$;


revoke all on function public.exam_admin_amend_key(uuid, text, jsonb, boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_admin_amend_key(uuid, text, jsonb, boolean) to service_role;
  end if;
end
$$;
