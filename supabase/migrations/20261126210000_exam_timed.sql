-- Timed papers: a server-owned deadline, answers refused after it, lazy finalization.
--
-- The browser never chooses an expiry. The deadline comes from the paper's rule and the
-- database clock at creation, and every edit re-checks it in the same transaction that
-- locks the attempt. A whole-paper timer is supported; a section-scheduled paper is
-- refused with unsupported_timing rather than approximated.

create or replace function public.exam_create_timed_attempt(
  p_owner uuid,
  p_paper_slug text,
  p_create_key text,
  p_locale text default 'en'
)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_paper content.papers%rowtype;
  v_rule content.exam_rule_versions%rowtype;
  v_key uuid;
  v_version uuid;
  v_duration integer;
  v_attempt public.exam_attempts%rowtype;
  v_existing public.exam_attempts%rowtype;
  v_items integer := 0;
begin
  select * into v_paper from content.papers where slug = p_paper_slug and status <> 'archived';
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
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
    coalesce(m.marking, v_rule.marking)
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
$$;

/** Finalize one attempt from its persisted answers. Safe to call repeatedly. */
create or replace function public.exam_finalize_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  v_attempt public.exam_attempts%rowtype;
  v_result jsonb;
begin
  select * into v_attempt from public.exam_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_attempt.state in ('submitted', 'expired', 'abandoned') then
    return jsonb_build_object('attempt_id', p_attempt_id, 'state', v_attempt.state);
  end if;

  v_result := public.exam_submit_attempt(p_attempt_id, v_attempt.owner_id);
  return v_result;
end;
$$;

-- Every timed attempt whose deadline has passed, finalized from persisted answers. The
-- health endpoint calls this, so an unattended paper is never left active.
create or replace function public.exam_finalize_expired()
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
declare
  rec record;
  v_count integer := 0;
  v_failed integer := 0;
begin
  for rec in
    select id from public.exam_attempts
     where mode = 'timed' and state = 'active'
       and deadline_at is not null and deadline_at <= now()
     order by deadline_at
     limit 200
  loop
    begin
      perform public.exam_finalize_attempt(rec.id);
      v_count := v_count + 1;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('finalized', v_count, 'failed', v_failed);
end;
$$;

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
    -- Close the paper first, then refuse: the deadline is not a suggestion.
    perform public.exam_finalize_attempt(p_attempt_id);
    raise exception 'deadline_passed' using errcode = '22023';
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

-- The manifest reports authoritative time and finalizes a paper whose clock ran out, so a
-- client that was away sees the truth on return instead of a stale editable screen.
create or replace function public.exam_attempt_manifest(p_attempt_id uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, content, pg_temp
as $$
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
               'statements', ai.statements,
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
$$;

revoke all on function public.exam_create_timed_attempt(uuid, text, text, text) from public;
revoke all on function public.exam_finalize_attempt(uuid) from public;
revoke all on function public.exam_finalize_expired() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_create_timed_attempt(uuid, text, text, text) to service_role;
    grant execute on function public.exam_finalize_attempt(uuid) to service_role;
    grant execute on function public.exam_finalize_expired() to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.exam_create_timed_attempt(uuid, text, text, text) from anon;
    revoke all on function public.exam_finalize_attempt(uuid) from anon;
    revoke all on function public.exam_finalize_expired() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.exam_create_timed_attempt(uuid, text, text, text) from authenticated;
    revoke all on function public.exam_finalize_attempt(uuid) from authenticated;
    revoke all on function public.exam_finalize_expired() from authenticated;
  end if;
end
$$;
