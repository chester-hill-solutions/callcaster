-- #2215: separately validate workspace_audit_event UUID conversion and workspace cascade.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE column_type regtype;
BEGIN
  SELECT atttypid::regtype INTO column_type FROM pg_attribute
    WHERE attrelid = 'public.workspace_audit_event'::regclass AND attname = 'workspace_id'
      AND NOT attisdropped;
  IF column_type IS NULL OR column_type NOT IN ('text'::regtype, 'uuid'::regtype) THEN
    RAISE EXCEPTION 'workspace_audit_event.workspace_id has an unsupported type; migration refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_audit_event
    WHERE NOT pg_input_is_valid(workspace_id::text, 'uuid')) THEN
    RAISE EXCEPTION 'workspace_audit_event has invalid workspace UUIDs; migration refused';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_audit_event t
    LEFT JOIN public.workspace w ON w.id = t.workspace_id::uuid WHERE w.id IS NULL) THEN
    RAISE EXCEPTION 'workspace_audit_event has orphan workspace rows; migration refused';
  END IF;
  IF column_type = 'text'::regtype THEN
    ALTER TABLE public.workspace_audit_event ALTER COLUMN workspace_id TYPE uuid USING workspace_id::uuid;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspace_audit_event t
    LEFT JOIN public.workspace w ON w.id = t.workspace_id
    WHERE w.id IS NULL
  ) THEN
    RAISE EXCEPTION 'workspace_audit_event has orphan workspace rows; migration refused';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspace_audit_event'::regclass AND conname = 'workspace_audit_event_workspace_id_fkey') THEN
    ALTER TABLE public.workspace_audit_event ADD CONSTRAINT workspace_audit_event_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.workspace_audit_event'::regclass AND c.conname = 'workspace_audit_event_workspace_id_fkey'
      AND c.contype = 'f' AND c.confrelid = 'public.workspace'::regclass
      AND c.confdeltype = 'c'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.workspace_audit_event'::regclass AND attname = 'workspace_id')]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.workspace'::regclass AND attname = 'id')]::smallint[]
  ) THEN
    RAISE EXCEPTION 'workspace_audit_event_workspace_id_fkey has an unsupported definition; migration refused';
  END IF;
END $$;
ALTER TABLE public.workspace_audit_event VALIDATE CONSTRAINT workspace_audit_event_workspace_id_fkey;
COMMIT;
