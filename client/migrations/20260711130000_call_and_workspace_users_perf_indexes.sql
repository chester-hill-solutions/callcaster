-- Performance indexes for hot read paths on `call` and `workspace_users`.
--
-- call:
--   * The call-log list view (app/lib/call-log.server.ts) filters by
--     workspace and orders by date_created, currently forcing a full
--     seq scan + sort. Mirrors idx_message_workspace_date on `message`.
--   * Campaign billing/dashboard queries (app/lib/campaign-billing.server.ts)
--     filter calls by campaign_id.
--   * Live-call conference lookups (app/lib/database/telephony-db.server.ts)
--     look up rows by conference_id; most rows have a null conference_id,
--     so a partial index keeps it small and fast.
--   * Per-leg lookups (findCallSidByParentCallSid) filter by parent_call_sid.
--
-- workspace_users:
--   * The "list my workspaces" hot auth/nav path filters by user_id alone.
--     The existing UNIQUE(workspace_id, user_id) constraint (workspace_user_unique)
--     leads with workspace_id, so it cannot serve a WHERE user_id = ? lookup
--     without scanning; add a dedicated index on user_id.
CREATE INDEX IF NOT EXISTS call_workspace_date_created_idx
  ON public.call (workspace, date_created);

CREATE INDEX IF NOT EXISTS call_campaign_id_idx
  ON public.call (campaign_id);

CREATE INDEX IF NOT EXISTS call_conference_id_idx
  ON public.call (conference_id)
  WHERE conference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS call_parent_call_sid_idx
  ON public.call (parent_call_sid);

CREATE INDEX IF NOT EXISTS workspace_users_user_id_idx
  ON public.workspace_users (user_id);
