-- Metadata sidecar for the workspace audio library.
--
-- The library itself stays an S3 listing and `file_name` remains the contract
-- every consumer already depends on (campaign.voicedrop_audio,
-- campaign.voicemail_file, workspace_number.inbound_audio,
-- inbound_queue.hold_audio, and IVR script steps all store a bare filename).
-- This table only *annotates* those objects, so nothing has to migrate: a row
-- may be absent (pre-existing files backfill lazily on list) and its absence
-- degrades to "unknown duration", never to a broken reference.
--
-- workspace_id is text with no FK, matching the workspace_audit_event
-- precedent (public.workspace.id is uuid, but the Drizzle schema models it as
-- text; storing text keeps joins type-compatible on both sides).

CREATE TABLE IF NOT EXISTS public.workspace_audio (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  -- Object name within the workspace prefix, extension included ("intro.mp3").
  file_name text NOT NULL,
  origin text NOT NULL DEFAULT 'upload',
  duration_ms integer,
  size_bytes bigint,
  content_type text,
  -- Lineage for clips: the library file this was cut from, and the window used.
  -- Kept as a name (not an FK) so deleting a source never orphans its clips.
  source_file_name text,
  clip_start_ms integer,
  clip_end_ms integer,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_audio_origin_check
    CHECK (origin IN ('upload', 'recording', 'clip')),
  -- A clip is exactly: a source plus a well-formed window. Anything else is a
  -- bug in the caller, so let the database refuse it.
  CONSTRAINT workspace_audio_clip_window_check CHECK (
    (origin <> 'clip' AND source_file_name IS NULL
      AND clip_start_ms IS NULL AND clip_end_ms IS NULL)
    OR
    (origin = 'clip' AND source_file_name IS NOT NULL
      AND clip_start_ms IS NOT NULL AND clip_end_ms IS NOT NULL
      AND clip_start_ms >= 0 AND clip_end_ms > clip_start_ms)
  ),
  CONSTRAINT workspace_audio_duration_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT workspace_audio_size_check
    CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

-- One row per object. Also the lookup path for "annotate this listing".
CREATE UNIQUE INDEX IF NOT EXISTS workspace_audio_workspace_file_idx
  ON public.workspace_audio (workspace_id, file_name);

-- "Which clips came from this file?" for the delete/overwrite blast radius.
CREATE INDEX IF NOT EXISTS workspace_audio_source_idx
  ON public.workspace_audio (workspace_id, source_file_name)
  WHERE source_file_name IS NOT NULL;
