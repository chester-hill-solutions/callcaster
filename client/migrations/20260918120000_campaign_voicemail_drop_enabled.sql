-- campaign.voicemail_drop_enabled: an explicit switch for playing the
-- voicemail audio when a machine answers (#1839). Before this, a configured
-- voicemail_file implied the drop, and IVR also needed a script page named
-- "voicemail". Off by default; the Setup page owns the toggle.
-- Re-runnable: IF NOT EXISTS. Backfill preserves current behaviour.
ALTER TABLE public.campaign
  ADD COLUMN IF NOT EXISTS voicemail_drop_enabled boolean NOT NULL DEFAULT false;

UPDATE public.campaign
SET voicemail_drop_enabled = true
WHERE voicemail_file IS NOT NULL AND btrim(voicemail_file) <> '';
