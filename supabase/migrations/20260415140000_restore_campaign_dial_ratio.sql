-- `get_campaign_stats` and related SQL still join `campaign` (alias `cm`) and read
-- `dial_ratio`. Migration 20250807000000_drop_unused_columns.sql dropped the column
-- as unused by the app layer, which breaks those functions until they are rewritten.
-- Restore the column so existing database functions keep working.

alter table public.campaign
  add column if not exists dial_ratio numeric not null default 1;

comment on column public.campaign.dial_ratio is
  'Legacy predictive-dial setting; retained for DB RPC compatibility. Default 1.';
