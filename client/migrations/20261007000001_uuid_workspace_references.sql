-- #2215: enforce both existing UUID tenancy columns without deleting orphan rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.outreach_attempt t
    LEFT JOIN public.workspace w ON w.id = t.workspace
    WHERE w.id IS NULL
  ) THEN
    RAISE EXCEPTION 'outreach_attempt has orphan workspace rows; migration refused';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_attempt'::regclass AND conname = 'outreach_attempt_workspace_fkey') THEN
    ALTER TABLE public.outreach_attempt ADD CONSTRAINT outreach_attempt_workspace_fkey
      FOREIGN KEY (workspace) REFERENCES public.workspace(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.outreach_attempt'::regclass AND c.conname = 'outreach_attempt_workspace_fkey'
      AND c.contype = 'f' AND c.confrelid = 'public.workspace'::regclass
      AND c.confdeltype = 'c'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.outreach_attempt'::regclass AND attname = 'workspace')]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.workspace'::regclass AND attname = 'id')]::smallint[]
  ) THEN
    RAISE EXCEPTION 'outreach_attempt_workspace_fkey has an unsupported definition; migration refused';
  END IF;
END $$;
ALTER TABLE public.outreach_attempt VALIDATE CONSTRAINT outreach_attempt_workspace_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspace_events t
    LEFT JOIN public.workspace w ON w.id = t.workspace_id
    WHERE w.id IS NULL
  ) THEN
    RAISE EXCEPTION 'workspace_events has orphan workspace rows; migration refused';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.workspace_events'::regclass AND conname = 'workspace_events_workspace_id_fkey') THEN
    ALTER TABLE public.workspace_events ADD CONSTRAINT workspace_events_workspace_id_fkey
      FOREIGN KEY (workspace_id) REFERENCES public.workspace(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.workspace_events'::regclass AND c.conname = 'workspace_events_workspace_id_fkey'
      AND c.contype = 'f' AND c.confrelid = 'public.workspace'::regclass
      AND c.confdeltype = 'c'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.workspace_events'::regclass AND attname = 'workspace_id')]::smallint[]
      AND c.confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.workspace'::regclass AND attname = 'id')]::smallint[]
  ) THEN
    RAISE EXCEPTION 'workspace_events_workspace_id_fkey has an unsupported definition; migration refused';
  END IF;
END $$;
ALTER TABLE public.workspace_events VALIDATE CONSTRAINT workspace_events_workspace_id_fkey;
COMMIT;
