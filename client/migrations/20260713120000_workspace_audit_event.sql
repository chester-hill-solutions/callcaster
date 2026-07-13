-- Append-only workspace audit log for privileged actions (AUDIT-01).
CREATE TABLE IF NOT EXISTS public.workspace_audit_event (
  id bigserial PRIMARY KEY,
  workspace_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_type text NOT NULL,
  actor_id text,
  api_key_id bigint,
  action text NOT NULL,
  target_type text,
  target_id text,
  outcome text NOT NULL,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS workspace_audit_event_workspace_created_id_idx
  ON public.workspace_audit_event (workspace_id, created_at DESC, id DESC);
