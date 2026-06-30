-- Phase 1 schema transform — step 02: consolidate campaign subtype tables
-- Target: Railway review Postgres ONLY.
--
-- SKETCH — review and flesh out data migration before running on review DB.
-- Goal: merge live_campaign, ivr_campaign, message_campaign → public.campaign
-- with type-gated nullable columns (see docs/client-postgres-migration-plan.md).
--
-- App callers to update after this step (code change, not SQL):
--   app/lib/workspace-selector/WorkspaceSelectedNewUtils.server.ts
--   app/routes/workspaces+/$id/campaigns/$selected_id.loader.server.ts
--   app/routes/api+/ivr/*, message_media.action.server.ts, scripts/* routes
--
-- Idempotent column adds below; table drops are one-way.

BEGIN;

-- ─── Step A: add unified columns on campaign (nullable; gated by campaign.type) ─
--
-- Source mapping (schema.ts as of Phase 1):
--
--   live_campaign          → campaign
--     script_id            → script_id
--     disposition_options  → disposition_options
--     questions            → live_questions  (campaign.call_questions may already hold overlap)
--     voicedrop_audio      → voicedrop_audio
--
--   ivr_campaign           → campaign
--     script_id            → script_id  (same column; ivr + live share script FK)
--
--   message_campaign       → campaign
--     body_text              → body_text
--     message_media          → message_media  (text[])
--
-- campaign already has: call_questions, sms_messaging_service_sid, sms_send_mode,
--   dial_ratio, dial_type, voicemail_file, type, workspace, …

ALTER TABLE public.campaign
  ADD COLUMN IF NOT EXISTS script_id integer NULL,
  ADD COLUMN IF NOT EXISTS disposition_options jsonb NULL,
  ADD COLUMN IF NOT EXISTS live_questions jsonb NULL,
  ADD COLUMN IF NOT EXISTS voicedrop_audio text NULL,
  ADD COLUMN IF NOT EXISTS body_text text NULL,
  ADD COLUMN IF NOT EXISTS message_media text[] NULL;

-- Optional FK (add after backfill + orphan check):
-- ALTER TABLE public.campaign
--   DROP CONSTRAINT IF EXISTS campaign_script_id_fkey;
-- ALTER TABLE public.campaign
--   ADD CONSTRAINT campaign_script_id_fkey
--   FOREIGN KEY (script_id) REFERENCES public.script(id);

-- ─── Step B: data backfill (UNCOMMENT after validating row counts on review) ──
--
-- Pre-check:
--   SELECT type, count(*) FROM campaign GROUP BY 1;
--   SELECT count(*) FROM live_campaign;
--   SELECT count(*) FROM ivr_campaign;
--   SELECT count(*) FROM message_campaign;
--   -- Detect multi-row subtype per campaign_id (should be 0 or 1):
--   SELECT campaign_id, count(*) FROM live_campaign GROUP BY 1 HAVING count(*) > 1;
--
-- live_call campaigns:
-- UPDATE public.campaign c
-- SET
--   script_id = lc.script_id,
--   disposition_options = lc.disposition_options,
--   live_questions = lc.questions,
--   voicedrop_audio = lc.voicedrop_audio
-- FROM public.live_campaign lc
-- WHERE lc.campaign_id = c.id
--   AND c.type = 'live_call';
--
-- robocall / simple_ivr / complex_ivr (confirm type strings in prod data):
-- UPDATE public.campaign c
-- SET script_id = ic.script_id
-- FROM public.ivr_campaign ic
-- WHERE ic.campaign_id = c.id
--   AND c.type IN ('robocall', 'simple_ivr', 'complex_ivr');
--
-- message campaigns:
-- UPDATE public.campaign c
-- SET
--   body_text = mc.body_text,
--   message_media = mc.message_media
-- FROM public.message_campaign mc
-- WHERE mc.campaign_id = c.id
--   AND c.type = 'message';
--
-- Reconcile call_questions vs live_questions if both populated:
-- UPDATE public.campaign
-- SET live_questions = call_questions
-- WHERE live_questions IS NULL AND call_questions IS NOT NULL AND type = 'live_call';

-- ─── Step C: orphan / mismatch report (run manually before drop) ────────────
--
-- SELECT lc.id, lc.campaign_id FROM live_campaign lc
--   LEFT JOIN campaign c ON c.id = lc.campaign_id WHERE c.id IS NULL;
-- SELECT ic.id, ic.campaign_id FROM ivr_campaign ic
--   LEFT JOIN campaign c ON c.id = ic.campaign_id WHERE c.id IS NULL;
-- SELECT mc.id, mc.campaign_id FROM message_campaign mc
--   LEFT JOIN campaign c ON c.id = mc.campaign_id WHERE c.id IS NULL;
--
-- Campaigns missing subtype row for their type:
-- SELECT c.id, c.type FROM campaign c
--   WHERE c.type = 'live_call'
--     AND NOT EXISTS (SELECT 1 FROM live_campaign lc WHERE lc.campaign_id = c.id);

-- ─── Step D: drop subtype tables (CASCADE drops FKs from script, etc.) ───────
-- UNCOMMENT only after backfill verified and app code ported to unified campaign.

-- DROP TABLE IF EXISTS public.live_campaign CASCADE;
-- DROP TABLE IF EXISTS public.ivr_campaign CASCADE;
-- DROP TABLE IF EXISTS public.message_campaign CASCADE;

-- ─── Step E: post-consolidation notes ───────────────────────────────────────
-- • Remove Drizzle tables ivr_campaign, live_campaign, message_campaign from schema.ts
-- • Zod discriminated union on campaign.type for type-gated column validation
-- • script_id on campaign replaces per-table script FK lookups in ivr/status routes

COMMIT;
