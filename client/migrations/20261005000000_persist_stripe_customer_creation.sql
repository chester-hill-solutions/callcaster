ALTER TABLE public.workspace
  ADD COLUMN IF NOT EXISTS stripe_customer_creation jsonb,
  ADD COLUMN IF NOT EXISTS stripe_customer_creation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_conflict jsonb,
  ADD COLUMN IF NOT EXISTS stripe_customer_creation_completed_id text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_stripe_customer_creation_pair'
                 AND conrelid = 'public.workspace'::regclass) THEN
    ALTER TABLE public.workspace ADD CONSTRAINT workspace_stripe_customer_creation_pair
      CHECK ((stripe_customer_creation IS NULL) = (stripe_customer_creation_started_at IS NULL));
  END IF;
END $$;
