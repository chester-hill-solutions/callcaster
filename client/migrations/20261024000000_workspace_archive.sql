-- Workspace archive (#2732).
--
-- "Delete workspace" is an archive: the row stays, the workspace disappears from
-- every user-facing list and route, and its phone numbers are released at the
-- provider first so the customer stops paying rent for them.
--
-- Keeping the row is what makes the numbers releasable at all. `workspace_number`
-- and `workspace_number_purchase` both carry
-- `FOREIGN KEY (workspace) REFERENCES workspace(id) ON DELETE CASCADE`, so a hard
-- delete destroys the only record of which Twilio numbers to release, and they
-- keep billing with nothing in the app pointing at them.
ALTER TABLE public.workspace
    ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

-- The picker and the workspace layout both ask "is this workspace archived?"
-- per request; the partial index keeps that a single indexed lookup over the
-- small set of archived rows instead of a scan of the workspace table.
CREATE INDEX IF NOT EXISTS workspace_archived_at_idx
    ON public.workspace (archived_at)
    WHERE archived_at IS NOT NULL;
