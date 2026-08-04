-- Phase 1 schema transform — step 06: ADR-0015 call/message normalization
-- Target: Railway review Postgres ONLY.
-- SKETCH — review row counts and app billing keys before uncommenting destructive steps.
--
-- Goal:
--   - Domain UUID primary key on call/message (id)
--   - twilio_sid column (indexed, unique per workspace) replaces sid as PK identifier
--   - parent_call_id FK (uuid) replaces parent_call_sid string
--   - Drop Twilio API noise columns (account_sid, api_version, subresource_uris, uri, …)

BEGIN;

-- ─── 1. Add new columns (idempotent) ────────────────────────────────────────

ALTER TABLE public.call
  ADD COLUMN IF NOT EXISTS twilio_sid text,
  ADD COLUMN IF NOT EXISTS parent_call_id uuid;

ALTER TABLE public.message
  ADD COLUMN IF NOT EXISTS twilio_sid text;

-- Backfill twilio_sid from legacy sid column
UPDATE public.call SET twilio_sid = sid WHERE twilio_sid IS NULL AND sid IS NOT NULL;
UPDATE public.message SET twilio_sid = sid WHERE twilio_sid IS NULL AND sid IS NOT NULL;

-- ─── 2. parent_call_id backfill (commented — validate orphans first) ────────
--
-- UPDATE public.call child
-- SET parent_call_id = parent.id
-- FROM public.call parent
-- WHERE child.parent_call_sid IS NOT NULL
--   AND child.parent_call_sid = parent.sid
--   AND child.parent_call_id IS NULL;

-- ─── 3. Indexes (before PK swap) ───────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS call_workspace_twilio_sid_uidx
  ON public.call (workspace, twilio_sid)
  WHERE twilio_sid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS message_workspace_twilio_sid_uidx
  ON public.message (workspace, twilio_sid)
  WHERE twilio_sid IS NOT NULL;

-- ─── 4. Drop noise columns (COMMENTED — requires app + billing key migration) ─
--
-- ALTER TABLE public.call
--   DROP COLUMN IF EXISTS account_sid,
--   DROP COLUMN IF EXISTS api_version,
--   DROP COLUMN IF EXISTS subresource_uris,
--   DROP COLUMN IF EXISTS uri,
--   DROP COLUMN IF EXISTS forwarded_from,
--   DROP COLUMN IF EXISTS group_sid,
--   DROP COLUMN IF EXISTS phone_number_sid,
--   DROP COLUMN IF EXISTS price,
--   DROP COLUMN IF EXISTS price_unit,
--   DROP COLUMN IF EXISTS queue_time,
--   DROP COLUMN IF EXISTS from_formatted,
--   DROP COLUMN IF EXISTS to_formatted;
--
-- ALTER TABLE public.message
--   DROP COLUMN IF EXISTS account_sid,
--   DROP COLUMN IF EXISTS api_version,
--   DROP COLUMN IF EXISTS subresource_uris,
--   DROP COLUMN IF EXISTS uri,
--   DROP COLUMN IF EXISTS price,
--   DROP COLUMN IF EXISTS price_unit;

-- ─── 5. PK swap to domain id (COMMENTED — highest risk; single maintenance window) ─
--
-- Requires: all FKs referencing call.sid / message.sid rewritten to id/uuid first.
-- See ADR-0015 and billing idempotency keys (call:${sid}:${kind} → call:${twilio_sid}:${kind}).

COMMIT;
