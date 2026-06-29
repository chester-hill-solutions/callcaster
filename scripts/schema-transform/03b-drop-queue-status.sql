-- Phase 1 — step 03b: drop legacy campaign_queue.status
-- Target: Railway review ONLY. Run after 03-normalize-campaign-queue.sql + 03a-rewrite-queue-rpcs.sql

BEGIN;

ALTER TABLE public.campaign_queue
  DROP COLUMN IF EXISTS status;

COMMIT;
