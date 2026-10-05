ALTER TABLE public.workspace
  ADD COLUMN IF NOT EXISTS stripe_customer_creation jsonb,
  ADD COLUMN IF NOT EXISTS stripe_customer_creation_started_at timestamptz;

ALTER TABLE public.workspace
  ADD CONSTRAINT workspace_stripe_customer_creation_pair
  CHECK ((stripe_customer_creation IS NULL) = (stripe_customer_creation_started_at IS NULL));
