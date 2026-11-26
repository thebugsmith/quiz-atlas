-- An editor save must not erase the two columns of a match question.
--
-- `admin_question_save` writes an explicit column list and the editor has no controls for
-- `match`, so saving a typo fix would have dropped the lists. The new version copies the current
-- version's match; changing the lists means re-running the paper import, not the editor.

CREATE OR REPLACE FUNCTION public.admin_question_save(p_actor uuid, p_question_id uuid, p_external_id text, p_topic_slug text, p_difficulty text, p_question_type text, p_stem text, p_statements text[], p_prompt text, p_options jsonb, p_correct_option_id integer, p_explanation text, p_content_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_question content.questions%rowtype;
  v_topic_id uuid;
  v_current content.question_versions%rowtype;
  v_next integer;
  v_hash text;
  v_version_id uuid;
  v_unchanged boolean := false;
begin
  perform public.admin_require(p_actor);

  select id into v_topic_id from content.topics where slug = p_topic_slug;
  if v_topic_id is null then
    raise exception 'topic_not_found' using errcode = 'P0002';
  end if;

  if not content.options_are_valid(p_options, p_correct_option_id) then
    raise exception 'invalid_options' using errcode = '22023';
  end if;

  if p_question_type not in ('mcq', 'comprehension') then
    raise exception 'invalid_question_type' using errcode = '22023';
  end if;
  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'invalid_difficulty' using errcode = '22023';
  end if;

  -- The fingerprint is computed by the shared TypeScript helper and passed in, so an
  -- editor save and a file import of the same body produce the same hash.
  if p_content_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_content_hash' using errcode = '22023';
  end if;
  v_hash := p_content_hash;

  if p_question_id is not null then
    select * into v_question from content.questions where id = p_question_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  else
    select * into v_question from content.questions where external_id = p_external_id for update;
    if not found then
      insert into content.questions (external_id) values (p_external_id) returning * into v_question;
    end if;
  end if;

  if v_question.current_version_id is not null then
    select * into v_current from content.question_versions where id = v_question.current_version_id;
    -- Classification is not part of the body fingerprint, so an edit that only moves a
    -- question between topics still has to produce a version.
    if v_current.content_hash = v_hash
       and v_current.topic_id = v_topic_id
       and v_current.difficulty = p_difficulty::content.difficulty
       and v_current.question_type = p_question_type::content.question_type then
      return jsonb_build_object(
        'question_id', v_question.id, 'version_id', v_current.id,
        'version_number', v_current.version_number, 'unchanged', true
      );
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from content.question_versions where question_id = v_question.id;

  insert into content.question_versions (
    question_id, version_number, topic_id, difficulty, question_type,
    stem, statements, prompt, options, correct_option_id, explanation, content_hash, match
  ) values (
    v_question.id, v_next, v_topic_id, p_difficulty::content.difficulty, p_question_type::content.question_type,
    nullif(btrim(coalesce(p_stem, '')), ''), coalesce(p_statements, '{}'), p_prompt, p_options,
    p_correct_option_id, nullif(btrim(coalesce(p_explanation, '')), ''), v_hash,
    -- the editor has no column controls; an edit keeps the two columns it cannot see
    (select existing.match from content.question_versions existing where existing.id = v_question.current_version_id)
  ) returning id into v_version_id;


  update content.questions set updated_at = now() where id = v_question.id;

  return jsonb_build_object(
    'question_id', v_question.id, 'version_id', v_version_id,
    'version_number', v_next, 'unchanged', v_unchanged
  );
end;
$function$;

revoke all on function public.admin_question_save(uuid, uuid, text, text, text, text, text, text[], text, jsonb, integer, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_question_save(uuid, uuid, text, text, text, text, text, text[], text, jsonb, integer, text, text) to service_role;
  end if;
end $$;
