-- Slice 12.1: live transcription + coaching schema (issue #1016 / ADR-0027-0029).
-- Applied in-place (ADR-0008 superseded callcaster-v2 fork).
--
-- NOTE: ADR-0015 (call.id domain PK) is not yet applied. Until then, new tables
-- FK to call.sid via call_sid. When ADR-0015 lands, migrate call_sid → call_id.

BEGIN;

-- workspace: coaching config (feature_flags already exists)
ALTER TABLE public.workspace
  ADD COLUMN IF NOT EXISTS coaching_config jsonb
    NOT NULL
    DEFAULT '{"fillerWords":["uh","um","like","you know","basically","actually"],"wpmMin":120,"wpmMax":160,"pauseThresholdMs":1500,"llmCadenceMs":30000,"llmPersona":"encouraging sales coach","disclosureEnabled":false}'::jsonb;

-- call: recording + golden transcript pointers
ALTER TABLE public.call
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS transcript_id uuid,
  ADD COLUMN IF NOT EXISTS coaching_session_id uuid;

CREATE TABLE IF NOT EXISTS public.transcript_segment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid text NOT NULL REFERENCES public.call (sid) ON DELETE CASCADE,
  speaker integer NOT NULL,
  speaker_label text,
  text text NOT NULL,
  start_ms bigint NOT NULL,
  end_ms bigint NOT NULL,
  confidence real,
  filler_count integer DEFAULT 0,
  is_final boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcript_segment_call_sid_idx
  ON public.transcript_segment (call_sid);

CREATE TABLE IF NOT EXISTS public.coaching_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid text NOT NULL REFERENCES public.call (sid) ON DELETE CASCADE,
  type text NOT NULL,
  severity text,
  payload jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coaching_event_call_sid_idx
  ON public.coaching_event (call_sid);

CREATE TABLE IF NOT EXISTS public.coaching_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid text NOT NULL REFERENCES public.call (sid) ON DELETE CASCADE,
  wpm_avg integer,
  filler_count integer,
  pause_count integer,
  long_pause_count integer,
  score integer,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coaching_session_call_sid_unique UNIQUE (call_sid)
);

CREATE TABLE IF NOT EXISTS public.call_transcript (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid text NOT NULL REFERENCES public.call (sid) ON DELETE CASCADE,
  provider text NOT NULL,
  language text DEFAULT 'en',
  full_text text,
  word_count integer,
  duration_ms bigint,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_transcript_call_sid_unique UNIQUE (call_sid)
);

COMMIT;
