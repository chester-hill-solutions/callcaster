-- Run in a READ ONLY transaction. Return aggregates only, including synthetic
-- controls that show why repeated contact IDs cannot prove one broken visit.
WITH answer_counts AS (
  SELECT response_id, count(*)::bigint AS answers
  FROM public.response_answer GROUP BY response_id
), question_counts AS (
  SELECT p.survey_id, count(q.id)::bigint AS questions
  FROM public.survey_page p
  LEFT JOIN public.survey_question q ON q.page_id = p.id
  GROUP BY p.survey_id
), responses AS (
  SELECT 'production'::text AS cohort, r.id, r.survey_id, r.contact_id,
    CASE WHEN r.contact_id IS NULL THEN 'anonymous'
      WHEN c.id IS NOT NULL AND c.workspace = s.workspace THEN 'contact_backed'
      ELSE 'unlinked_contact' END AS identity_kind,
    r.completed_at IS NOT NULL AS completed,
    coalesce(a.answers, 0) AS answers, coalesce(q.questions, 0) AS questions
  FROM public.survey_response r
  LEFT JOIN public.survey s ON s.id = r.survey_id
  LEFT JOIN public.contact c ON c.id = r.contact_id
  LEFT JOIN answer_counts a ON a.response_id = r.id
  LEFT JOIN question_counts q ON q.survey_id = r.survey_id
  UNION ALL
  SELECT * FROM (VALUES
    ('legitimate_contact_repeats', -1::bigint, -1::bigint, -1::bigint, 'contact_backed', true, 2::bigint, 2::bigint),
    ('legitimate_contact_repeats', -2, -1, -1, 'contact_backed', true, 2, 2),
    ('separate_anonymous_visits', -3, -2, NULL, 'anonymous', true, 2, 2),
    ('separate_anonymous_visits', -4, -2, NULL, 'anonymous', true, 2, 2),
    ('ambiguous_contact_partials', -5, -3, -2, 'contact_backed', false, 1, 2),
    ('ambiguous_contact_partials', -6, -3, -2, 'contact_backed', false, 1, 2)
  ) AS controls(cohort, id, survey_id, contact_id, identity_kind, completed, answers, questions)
), populations AS (
  SELECT * FROM (VALUES
    ('production', 'anonymous'), ('production', 'contact_backed'),
    ('production', 'unlinked_contact'),
    ('legitimate_contact_repeats', 'contact_backed'),
    ('separate_anonymous_visits', 'anonymous'),
    ('ambiguous_contact_partials', 'contact_backed')
  ) AS names(cohort, identity_kind)
), population_counts AS (
  SELECT p.cohort, p.identity_kind, count(r.id) AS responses,
    coalesce(sum(r.answers), 0) AS answers,
    count(r.id) FILTER (WHERE r.completed) AS completed,
    count(r.id) FILTER (WHERE r.answers = 0) AS zero_answer_responses,
    count(r.id) FILTER (
      WHERE NOT r.completed AND r.answers = 1 AND r.questions > 1
    ) AS ambiguous_single_answer_partials
  FROM populations p
  LEFT JOIN responses r USING (cohort, identity_kind)
  GROUP BY p.cohort, p.identity_kind
), repeated_contacts AS (
  SELECT cohort, survey_id, contact_id, count(*) AS responses,
    bool_and(completed) AS all_completed
  FROM responses WHERE contact_id IS NOT NULL
  GROUP BY cohort, survey_id, contact_id HAVING count(*) > 1
)
SELECT jsonb_build_object(
  'inspected_at', transaction_timestamp(),
  'read_only', current_setting('transaction_read_only'),
  'isolation', current_setting('transaction_isolation'),
  'statement_timeout', current_setting('statement_timeout'),
  'lock_timeout', current_setting('lock_timeout'),
  'access', (
    SELECT jsonb_build_object('superuser', rolsuper, 'bypass_rls', rolbypassrls)
    FROM pg_roles WHERE rolname = current_user
  ),
  'relation_visibility', (
    SELECT jsonb_agg(jsonb_build_object('table', c.relname,
      'rls_enabled', c.relrowsecurity, 'force_rls', c.relforcerowsecurity))
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN
      ('survey', 'survey_response', 'response_answer', 'contact')
  ),
  'totals', jsonb_build_object(
    'surveys', (SELECT count(*) FROM public.survey),
    'active_surveys', (SELECT count(*) FROM public.survey WHERE is_active),
    'responses', (SELECT count(*) FROM public.survey_response),
    'answers', (SELECT count(*) FROM public.response_answer),
    'orphan_answers', (SELECT count(*) FROM public.response_answer a
      LEFT JOIN public.survey_response r ON r.id = a.response_id WHERE r.id IS NULL),
    'orphan_survey_responses', (SELECT count(*) FROM public.survey_response r
      LEFT JOIN public.survey s ON s.id = r.survey_id WHERE s.id IS NULL),
    'first_response_day', (SELECT date_trunc('day', min(created_at)) FROM public.survey_response),
    'last_response_day', (SELECT date_trunc('day', max(created_at)) FROM public.survey_response)
  ),
  'populations', (SELECT jsonb_agg(to_jsonb(p) ORDER BY cohort, identity_kind) FROM population_counts p),
  'repeated_contact_groups', (
    SELECT jsonb_agg(jsonb_build_object('cohort', cohort, 'groups', groups,
      'all_completed_groups', all_completed_groups) ORDER BY cohort)
    FROM (
      SELECT names.cohort, count(r.contact_id) AS groups,
        count(r.contact_id) FILTER (WHERE r.all_completed) AS all_completed_groups
      FROM (SELECT DISTINCT cohort FROM populations) names
      LEFT JOIN repeated_contacts r USING (cohort) GROUP BY names.cohort
    ) counts
  )
) AS assessment;
