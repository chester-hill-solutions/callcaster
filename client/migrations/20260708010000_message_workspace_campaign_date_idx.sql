-- The chats sidebar now aggregates conversation summaries directly in SQL
-- (GROUP BY the contact-phone key derived from workspace numbers) instead of
-- paging raw messages into the app and grouping in memory. The existing
-- idx_message_workspace_date index already scopes the aggregation scan to a
-- single workspace; this adds campaign_id to the key so campaign-filtered
-- conversation views (chats?campaign_id=...) don't fall back to filtering
-- the whole workspace partition row-by-row.
CREATE INDEX IF NOT EXISTS idx_message_workspace_campaign_date
  ON public.message (workspace, campaign_id, date_created);
