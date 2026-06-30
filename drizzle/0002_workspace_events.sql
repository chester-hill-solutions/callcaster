-- Append-only workspace event log for SSE realtime (ADR-0005).
CREATE TABLE IF NOT EXISTS workspace_events (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_events_workspace_id_id_idx
  ON workspace_events (workspace_id, id);
