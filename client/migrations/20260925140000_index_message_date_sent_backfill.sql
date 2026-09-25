-- Migration: index the send-time backfill population (#2049)
--
-- This migration is the index half of #2049. The code half lives in
-- app/lib/twilio-open-sync.server.ts, which selects message rows that have left
-- the open statuses but never recorded the provider's send time:
--
--     date_sent IS NULL
--     AND status <> ALL (open statuses)
--     AND date_created within the backfill age window
--     ORDER BY date_created ASC
--     LIMIT 100
--
-- Why this needs its own index, measured rather than guessed.
--
-- The existing idx_message_workspace_date (workspace, date_created) already
-- serves the BACKLOG case. With 50,000 unfilled rows for one workspace it
-- returns the first 100 in 0.13 ms / 247 buffers, discarding only 20 rows to
-- the filter. The range, ordering and limit line up exactly with the index, so
-- no new index is needed to find work.
--
-- The problem is the opposite case: a workspace with NOTHING to backfill. The
-- predicate `date_sent IS NULL` is unselective and nothing in the table's
-- indexes mentions it, so the planner has no way to know the answer is empty
-- and must walk every row in the age window to prove it. Measured on 50,000
-- rows for a single workspace:
--
--     without this index:  29.8 ms, 150,568 buffers
--     with this index:      0.19 ms,     206 buffers
--
-- That is ~150x fewer buffers, and it matters because the query runs every 5
-- minutes per workspace, forever, and the cost scaled with the workspace's
-- message volume inside the window rather than with the amount of outstanding
-- work. A quiet, healthy workspace was paying the most for having nothing to do.
--
-- A partial index is the right shape because the indexed population is exactly
-- the "needs work" population: it shrinks to nothing as the backfill drains, so
-- it costs nothing in steady state instead of costing a range scan. Index size
-- measured at 6.6 MB across 250,000 rows all awaiting backfill, and near zero
-- once they are filled.
--
-- The age bounds from the code are deliberately NOT part of the predicate. They
-- move on every run, and an index whose predicate changes per query cannot be
-- used. Keeping them out means the index stays a stable "needing work" set and
-- the date_created range remains an ordinary, index-friendly index condition.
--
-- `message.status` is the message_status ENUM in every real database lineage
-- (#1289), so the array is cast explicitly rather than relying on the literal
-- being inferred. This mirrors the explicit `::text` casts in
-- 20260925120000_gate_campaign_completion_on_settled_messages.sql.

create index if not exists idx_message_date_sent_backfill
  on message (workspace, date_created)
  where date_sent is null
    and status <> all (array['accepted', 'scheduled', 'queued', 'sending']::message_status[]);

comment on index idx_message_date_sent_backfill is
  'Partial index over message rows still awaiting a provider send time (#2049). Backs the twilio-open-sync backfill selection; empty in steady state, so it costs nothing when there is no work.';
