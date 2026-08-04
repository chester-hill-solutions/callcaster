-- Phase 1 schema transform — step 00: preflight
-- Target: Railway review Postgres ONLY. Do NOT run on hosted Postgres prod.
-- Idempotent: safe to re-run; read-only checks except session settings.

-- ─── Session settings ───────────────────────────────────────────────────────

SET client_min_messages = WARNING;
SET lock_timeout = '30s';
SET statement_timeout = '0'; -- transform scripts manage their own timeouts per step

-- ─── Environment marker (manual) ──────────────────────────────────────────────
-- Before running 01+, confirm:
--   SELECT current_database(), inet_server_addr(), version();
-- Expect Railway review host, NOT Postgres pooler.

DO $$
BEGIN
  RAISE NOTICE 'schema-transform 00-preflight: database=% user=%',
    current_database(), current_user;
END $$;

-- ─── Required extensions (install if missing on Railway PG 18) ─────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
DECLARE
  ext text;
  optional text[] := ARRAY[
    'pg_net',          -- pg_cron jobs (dropped from squashed baseline later)
    'pg_cron',
    'pg_stat_statements'
  ];
BEGIN
  FOREACH ext IN ARRAY optional LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = ext) THEN
      RAISE WARNING 'Optional extension % not installed (OK if pg_cron already removed)', ext;
    END IF;
  END LOOP;
END $$;

-- ─── Preflight: tables referenced by later steps should exist pre-transform ───
-- Vestigial tables (01) and subtype tables (02) must be present on a prod dump.

DO $$
DECLARE
  tbl text;
  expected text[] := ARRAY[
    'campaign',
    'campaign_queue',
    'contact',
    'live_campaign',
    'ivr_campaign',
    'message_campaign'
  ];
BEGIN
  FOREACH tbl IN ARRAY expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      RAISE WARNING 'Expected table public.% not found — skip or adjust downstream steps', tbl;
    END IF;
  END LOOP;
END $$;

-- ─── Preflight: campaign_queue normalization columns (03 will enforce) ───────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaign_queue'
      AND column_name = 'status'
  ) THEN
    RAISE NOTICE 'campaign_queue.status present — step 03 will backfill queue_state then drop';
  END IF;
END $$;
