-- Migration: Update pg_cron jobs to call Remix routes instead of Edge Functions
-- Run this against the Railway Postgres DB after deploying the new app version.

BEGIN;

-- Update twilio_open_sync_every_5m to call Remix route
UPDATE cron.job
SET command = format(
  'SELECT net.http_post(%L, jsonb_build_object(''workspaceId'', NULL, ''callLimit'', 50, ''messageLimit'', 50, ''maxAgeMinutes'', 120), ''{}'')',
  (SELECT rtrim(btrim(current_setting('app.settings.base_url', true)), '/') || '/api/jobs/twilio-open-sync')
)
WHERE jobname = 'twilio_open_sync_every_5m';

-- Update number_rental_billing_daily to call Remix route
UPDATE cron.job
SET command = format(
  'SELECT net.http_post(%L, jsonb_build_object(''workspaceId'', NULL), ''{}'')',
  (SELECT rtrim(btrim(current_setting('app.settings.base_url', true)), '/') || '/api/jobs/number-rental-billing')
)
WHERE jobname = 'number_rental_billing_daily';

-- Update twilio_billing_reconcile_daily to call Remix route
UPDATE cron.job
SET command = format(
  'SELECT net.http_post(%L, jsonb_build_object(''workspaceId'', NULL), ''{}'')',
  (SELECT rtrim(btrim(current_setting('app.settings.base_url', true)), '/') || '/api/jobs/billing-reconcile')
)
WHERE jobname = 'twilio_billing_reconcile_daily';

COMMIT;

-- Verify
SELECT jobname, schedule, command FROM cron.job
WHERE jobname IN ('twilio_open_sync_every_5m', 'number_rental_billing_daily', 'twilio_billing_reconcile_daily');
