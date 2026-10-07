-- #2215: separately validate workspace_audio UUID conversion and workspace cascade.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE column_type regtype;
BEGIN
  SELECT atttypid::regtype INTO column_type FROM pg_attribute
    WHERE attrelid = 'public.workspace_audio'::regclass AND attname = 'workspace_id'
      AND NOT attisdropped;
  IF column_type IS NULL OR column_type NOT IN ('text'::regtype, 'uuid'::regtype) THEN
    RAISE EXCEPTION 'workspace_audio.workspace_id has an unsupported type; migration refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_audio
    WHERE NOT pg_input_is_valid(workspace_id::text, 'uuid')) THEN
    RAISE EXCEPTION 'workspace_audio has invalid workspace UUIDs; migration refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_audio t
    LEFT JOIN public.workspace w ON w.id = t.workspace_id::uuid WHERE w.id IS NULL) THEN
    RAISE EXCEPTION 'workspace_audio has orphan workspace rows; migration refused';
  END IF;
  IF column_type = 'text'::regtype THEN
    ALTER TABLE public.workspace_audio ALTER COLUMN workspace_id TYPE uuid USING workspace_id::uuid;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspace_audio t
    LEFT JOIN public.workspace w ON w.id = t.workspace_id
    WHERE w.id IS NULL
  ) THEN
    RAISE EXCEPTION 'workspace_audio has orphan workspace rows; migration refused';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspace_audio'::regclass AND conname = 'workspace_audio_workspace_id_fkey') THEN
    ALTER TABLE public.workspace_audio ADD CONSTRAINT workspace_audio_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.workspace_audio'::regclass AND c.conname = 'workspace_audio_workspace_id_fkey'
      AND c.contype = 'f' AND c.confrelid = 'public.workspace'::regclass
      AND c.confdeltype = 'c'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.workspace_audio'::regclass AND attname = 'workspace_id')]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.workspace'::regclass AND attname = 'id')]::smallint[]
  ) THEN
    RAISE EXCEPTION 'workspace_audio_workspace_id_fkey has an unsupported definition; migration refused';
  END IF;
END $$;
ALTER TABLE public.workspace_audio VALIDATE CONSTRAINT workspace_audio_workspace_id_fkey;
COMMIT;
