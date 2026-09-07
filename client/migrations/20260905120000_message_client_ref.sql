-- message.client_ref: the sender's own reference for an outbound SMS, written
-- BEFORE the Twilio call (the "intent row", #1582 / #1578). Until Twilio
-- answers, sid holds the placeholder 'pending:<client_ref>'; the status
-- webhook and the open-sync sweep resolve the placeholder by this column.
-- Re-runnable: IF NOT EXISTS on both statements.
ALTER TABLE public.message ADD COLUMN IF NOT EXISTS client_ref text;
CREATE INDEX IF NOT EXISTS message_client_ref_idx
  ON public.message (client_ref)
  WHERE client_ref IS NOT NULL;
