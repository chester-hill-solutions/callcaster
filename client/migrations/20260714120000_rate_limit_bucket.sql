-- Shared fixed-window rate limit buckets for multi-replica web (WS-E scale prep).
CREATE TABLE IF NOT EXISTS public.rate_limit_bucket (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_bucket_reset_at_idx
  ON public.rate_limit_bucket (reset_at);

-- Atomic check + increment under advisory lock (safe across replicas).
CREATE OR REPLACE FUNCTION public.check_rate_limit_bucket(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
RETURNS TABLE (
  ok boolean,
  remaining integer,
  reset_at_ms bigint,
  retry_after_seconds integer
)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window interval := (p_window_ms::text || ' milliseconds')::interval;
  v_reset timestamptz;
  v_count integer;
  v_ok boolean;
  v_remaining integer;
  v_retry integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  SELECT b.count, b.reset_at
  INTO v_count, v_reset
  FROM public.rate_limit_bucket b
  WHERE b.key = p_key;

  IF NOT FOUND OR v_reset <= v_now THEN
    v_count := 1;
    v_reset := v_now + v_window;
    v_ok := true;
    INSERT INTO public.rate_limit_bucket (key, count, reset_at)
    VALUES (p_key, v_count, v_reset)
    ON CONFLICT (key) DO UPDATE
    SET count = EXCLUDED.count, reset_at = EXCLUDED.reset_at;
  ELSIF v_count >= p_limit THEN
    v_ok := false;
  ELSE
    v_count := v_count + 1;
    v_ok := true;
    UPDATE public.rate_limit_bucket SET count = v_count WHERE key = p_key;
  END IF;

  v_remaining := GREATEST(0, p_limit - v_count);
  v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_reset - v_now)))::integer);

  RETURN QUERY SELECT
    v_ok,
    v_remaining,
    (EXTRACT(EPOCH FROM v_reset) * 1000)::bigint,
    CASE WHEN v_ok THEN 0 ELSE v_retry END;
END;
$$;

COMMENT ON TABLE public.rate_limit_bucket IS
  'Fixed-window HTTP rate limit counters shared across web replicas';
