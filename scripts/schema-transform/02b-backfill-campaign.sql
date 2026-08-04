-- Phase 1 — step 02b: backfill unified campaign columns and drop subtype tables
-- Target: Railway review ONLY. Run after 02-consolidate-campaign.sql (column adds).

BEGIN;

-- live_call (108 rows with campaign_id)
UPDATE public.campaign c
SET
  script_id = lc.script_id,
  disposition_options = lc.disposition_options,
  live_questions = lc.questions,
  voicedrop_audio = lc.voicedrop_audio
FROM public.live_campaign lc
WHERE lc.campaign_id = c.id
  AND c.type = 'live_call';

-- robocall / IVR (no simple_ivr/complex_ivr in review data)
UPDATE public.campaign c
SET script_id = ic.script_id
FROM public.ivr_campaign ic
WHERE ic.campaign_id = c.id
  AND c.type IN ('robocall', 'simple_ivr', 'complex_ivr');

-- message campaigns
UPDATE public.campaign c
SET
  body_text = mc.body_text,
  message_media = mc.message_media
FROM public.message_campaign mc
WHERE mc.campaign_id = c.id
  AND c.type = 'message';

-- call_questions column absent on review schema — skip reconcile.

DROP TABLE IF EXISTS public.live_campaign CASCADE;
DROP TABLE IF EXISTS public.ivr_campaign CASCADE;
DROP TABLE IF EXISTS public.message_campaign CASCADE;

COMMIT;
