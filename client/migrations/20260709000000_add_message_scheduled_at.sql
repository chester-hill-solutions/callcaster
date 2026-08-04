-- "Send later" scheduling needs to remember the requested send time.
-- Twilio's Message resource does not echo `send_at` back on create (it's a
-- write-only scheduling param), so we persist the caller's requested time
-- ourselves for status = 'scheduled' rows.
ALTER TABLE public.message
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;
