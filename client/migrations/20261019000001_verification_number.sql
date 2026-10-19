-- Platform call-in verification numbers (#2519).
--
-- Global, not tenant-scoped: the agent dials a CallCaster-owned number and the
-- app matches the caller ID against a pending session. The number is platform
-- configuration, so it must not live in an environment variable — an operator
-- registers it here and marks the one in use as active.
--
-- One number is used today. The table models several so the platform can grow
-- to bandwidth and regions without another schema change.
CREATE TABLE IF NOT EXISTS public.verification_number (
    phone_number text PRIMARY KEY,
    provider_sid text,
    label text,
    region text,
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- At most one active number today. The partial unique index makes that a
-- database guarantee, so two active rows cannot exist even for an instant
-- during a switch.
CREATE UNIQUE INDEX IF NOT EXISTS verification_number_single_active
    ON public.verification_number (is_active)
    WHERE is_active;
