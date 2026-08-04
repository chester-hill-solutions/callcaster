-- Durable store for API Idempotency-Key replay.
--
-- Replaces a per-process `Map`, which was void across restarts and across any
-- second replica. That store gated Stripe checkout-session creation, so a
-- retried request after a deploy could create a SECOND checkout session for the
-- same key — a real double-charge path.
CREATE TABLE IF NOT EXISTS public.idempotency_record (
  scope text NOT NULL,
  key text NOT NULL,
  status integer NOT NULL,
  body text NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

-- Sweep support: records are retained for a fixed TTL, then pruned.
CREATE INDEX IF NOT EXISTS idempotency_record_created_at_idx
  ON public.idempotency_record (created_at);
