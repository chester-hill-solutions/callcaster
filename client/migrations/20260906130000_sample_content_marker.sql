-- campaign.is_sample / script.is_sample: marks the first-value sample content
-- every new workspace is seeded with (#1070). Setup-wizard and launch-checklist
-- counts exclude sample rows, so a brand-new workspace is not told it already
-- has a campaign and a script. Re-runnable: IF NOT EXISTS.
ALTER TABLE public.campaign ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
ALTER TABLE public.script ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
