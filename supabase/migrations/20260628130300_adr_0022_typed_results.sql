-- ADR-0022: Typed voter contact results on outreach_attempt.
-- The freeform `result: Json` stays for backward compat; these typed columns
-- let exports/analytics query structured outcomes without parsing JSON.
-- `support_level` comes from ADR-0019 (migration 20260628130000).

alter table public.outreach_attempt
  add column if not exists volunteer_interest text;

alter table public.outreach_attempt
  add column if not exists lawn_sign boolean;

alter table public.outreach_attempt
  add column if not exists vote_by_mail boolean;

alter table public.outreach_attempt
  add column if not exists issue_tags text[];

alter table public.outreach_attempt
  add column if not exists membership_sold boolean;

alter table public.outreach_attempt
  add column if not exists callback_audit boolean;

create index if not exists outreach_attempt_issue_tags_idx
  on public.outreach_attempt using gin (issue_tags)
  where issue_tags is not null;
