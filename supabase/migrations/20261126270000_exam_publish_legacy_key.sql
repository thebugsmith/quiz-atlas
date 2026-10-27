-- Publishing a paper that was imported by the legacy path.
--
-- The publish gate counted keyed items only in `exam_key_items`, so a paper whose answers
-- arrived inside the paper (the CGPSC and NEET imports) failed with `incomplete_key:0/155`
-- even though every item had an answer. It also required a rule version, which the legacy
-- importer never wrote; study mode does not need one (only a timed sitting does, and that
-- still refuses with `rules_missing` at start).
--
-- The gate now counts the latest key version when one exists and otherwise the live
-- version's answer for each manifest item. The rule requirement is gone: publishing says
-- the paper's content and key are complete, not that a timed policy has been authored.

CREATE OR REPLACE FUNCTION public.exam_admin_set_status(p_actor uuid, p_paper_slug text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'content', 'pg_temp'
AS $function$
declare
  v_role public.admin_role;
  v_paper content.papers%rowtype;
  v_items integer;
  v_keyed integer;
  v_rule integer;
  v_key_source text;
begin
  v_role := public.admin_role_of(p_actor);
  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if v_role <> 'admin' then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_paper from content.papers where slug = p_paper_slug;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_status = 'published' then
    select count(*)::int into v_items from content.paper_manifest_items where paper_id = v_paper.id;
    select count(*)::int into v_keyed
      from content.exam_key_items ki
      join content.exam_key_versions kv on kv.id = ki.key_version_id
     where kv.paper_id = v_paper.id
       and kv.version_number = (select max(version_number) from content.exam_key_versions k where k.paper_id = v_paper.id);
    if v_keyed > 0 then
      v_key_source := 'key_version';
    else
      -- A legacy import keeps the answer on the live version of the question, so a paper
      -- with no key version can still be fully keyed. Counting only exam_key_items made
      -- those papers unpublishable with "incomplete_key:0/N".
      select count(*)::int into v_keyed
        from content.paper_questions pq
        join content.questions q on q.id = pq.question_id
        join content.question_versions qv on qv.id = q.current_version_id
       where pq.paper_id = v_paper.id and qv.correct_option_id is not null;
      v_key_source := 'embedded';
    end if;
    select count(*)::int into v_rule from content.exam_rule_versions where paper_id = v_paper.id;

    if v_items = 0 then
      raise exception 'paper_has_no_items' using errcode = '22023';
    end if;
    if v_keyed < v_items then
      raise exception 'incomplete_key:%/%', v_keyed, v_items using errcode = '22023';
    end if;
  end if;

  update content.papers
     set status = p_status,
         published_at = case when p_status = 'published' then now() else published_at end
   where id = v_paper.id;

  insert into public.admin_audit (actor_id, action, entity, entity_id, detail)
  values (p_actor, 'exam_paper_status', 'paper', v_paper.id, jsonb_build_object('status', p_status));

  return jsonb_build_object(
    'paper', p_paper_slug, 'status', p_status, 'key_source', v_key_source,
    'rule_versions', v_rule);
end;
$function$
;
