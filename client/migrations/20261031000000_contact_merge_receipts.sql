CREATE TABLE public.contact_merge_receipt (
  id uuid NOT NULL,
  workspace uuid NOT NULL REFERENCES public.workspace(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  retained_contact_id bigint NOT NULL,
  version text NOT NULL,
  source_profiles jsonb NOT NULL CHECK (jsonb_typeof(source_profiles) = 'array'),
  queue_snapshot jsonb NOT NULL CHECK (jsonb_typeof(queue_snapshot) = 'array'),
  effects jsonb NOT NULL CHECK (jsonb_typeof(effects) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace, id)
);
