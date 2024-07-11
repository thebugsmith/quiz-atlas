-- Probe rows for checking the access boundaries by hand (milestone 03).
--
-- Run inside the local stack:
--   docker exec -i supabase_db_quizapp psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/access_boundaries.sql
--
-- Then, with the local publishable key as ANON and the secret key as SECRET:
--   curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" \
--     http://127.0.0.1:54321/rest/v1/question_versions      # expect 404 (content is not exposed)
--   curl -s -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     http://127.0.0.1:54321/rest/v1/attempt_answers        # expect [] (RLS)
--   curl -s -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
--     'http://127.0.0.1:54321/rest/v1/attempt_answers?select=action,is_correct'   # expect the row
--
-- Automated database tests replace this manual probe in milestone 22.

-- Probe rows used only to prove access boundaries. Runs inside the local stack.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'probe@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name) values ('11111111-1111-4111-8111-111111111111', 'Probe Player')
on conflict (id) do nothing;

with topic as (select id from content.topics where slug = 'science'),
q as (
  insert into content.questions (external_id, status, created_by)
  values ('probe-question-001', 'draft', '11111111-1111-4111-8111-111111111111')
  on conflict (external_id) do update set updated_at = now()
  returning id
), v as (
  insert into content.question_versions
    (question_id, version_number, topic_id, difficulty, prompt, options, correct_option_id,
     explanation, content_hash, published_at)
  select q.id, 1, topic.id, 'easy', 'Which planet is the largest in our Solar System?',
    '[{"id":"jupiter","text":"Jupiter"},{"id":"saturn","text":"Saturn"},{"id":"neptune","text":"Neptune"},{"id":"earth","text":"Earth"}]'::jsonb,
    'jupiter', 'Jupiter is the largest planet in our Solar System.',
    repeat('a', 64), now()
  from q, topic
  on conflict (question_id, version_number) do nothing
  returning id, question_id
)
update content.questions set current_version_id = v.id, status = 'published' from v where questions.id = v.question_id;

insert into public.attempts (id, owner_id, mode, status, config, selection_seed, question_count, started_at)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'classic', 'active',
        '{"topics":["science"],"difficulty":"mixed","count":1}', 'seed-probe', 1, now())
on conflict (id) do nothing;

insert into public.attempt_questions (id, attempt_id, position, question_id, question_version_id, option_order)
select '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 1,
       qv.question_id, qv.id, '["jupiter","saturn","neptune","earth"]'::jsonb
from content.question_versions qv join content.questions q on q.id = qv.question_id
where q.external_id = 'probe-question-001'
on conflict do nothing;

insert into public.attempt_answers (attempt_id, attempt_question_id, action, selected_option_id, is_correct, points_awarded, idempotency_key)
values ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'answer', 'jupiter', true, 10, 'probe-key-0001')
on conflict do nothing;

select
  (select count(*) from content.question_versions) as versions,
  (select count(*) from public.attempts) as attempts,
  (select count(*) from public.attempt_answers) as answers;