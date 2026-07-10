-- Persist the Twilio IncomingPhoneNumber SID so number lifecycle/cleanup can target it directly (SID-based release) instead of matching by friendly_name.
ALTER TABLE public.workspace_number ADD COLUMN IF NOT EXISTS twilio_phone_number_sid text;
