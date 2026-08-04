-- Migration: Add unique constraint on (survey_id, result_id) for survey_response
-- Prevents duplicate responses for the same survey and respondent result id.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS survey_response_survey_result_unique
  ON survey_response (survey_id, result_id);

COMMIT;
