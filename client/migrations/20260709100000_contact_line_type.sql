-- Twilio Lookup v2 line-type cache. `line_type` is null until the contact's
-- first SMS send attempt triggers a lazy lookup; once populated it is treated
-- as permanent (line type essentially never changes) so we never re-pay for
-- a lookup. `line_type_checked_at` records when the (successful) lookup ran.
ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS line_type text;
ALTER TABLE public.contact ADD COLUMN IF NOT EXISTS line_type_checked_at timestamp with time zone;
