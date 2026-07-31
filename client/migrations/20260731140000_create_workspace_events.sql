-- Create workspace_events on the client/migrations lineage.
--
-- The table is created by `drizzle/0002_workspace_events.sql`, which only runs
-- for databases built from the drizzle baseline (bootstrap-fresh-db.mjs, the
-- compose bootstrap, production). Databases on the other lineage — dev, which
-- descends from the Supabase era via scripts/schema-transform — never ran it,
-- so the table simply does not exist there.
--
-- Verified 2026-07-31: `insert into workspace_events ...` on dev fails with
-- `relation "workspace_events" does not exist`, while production has the table.
--
-- The effect is invisible rather than loud: insertWorkspaceEvent is documented
-- best-effort ("a failed workspace_events insert must not [become] a
-- user-facing error"), so every SSE realtime event on dev has been silently
-- dropped, and the SSE reader at workspace-events.server.ts has nothing to
-- read. Live queue, call and chat updates cannot work on dev — which also means
-- realtime cannot be rehearsed there before it reaches customers.
--
-- IF NOT EXISTS so this is a no-op on any database that already ran
-- drizzle/0002; the definition below is copied from it verbatim.

CREATE TABLE IF NOT EXISTS workspace_events (
  id serial PRIMARY KEY,
  workspace_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_events_workspace_id_id_idx
  ON workspace_events (workspace_id, id);
