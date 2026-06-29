-- ADR-0020: Three-phase campaign model (Identification / Persuasion / GOTV).
-- Depends on ADR-0019 (support_level) for phase-scoped audience targeting.

do $$ begin
  create type public.campaign_phase as enum ('identification', 'persuasion', 'gotv');
exception
  when duplicate_object then null;
end $$;

alter table public.campaign
  add column if not exists phase public.campaign_phase;

-- Backfill existing campaigns to the default phase. We leave the column nullable
-- at the DB level (per ADR) but every existing row gets `identification`.
update public.campaign
  set phase = 'identification'
  where phase is null;

-- Default new inserts to identification so the column behaves as if NOT NULL
-- DEFAULT 'identification' without forcing a heavy rewrite.
alter table public.campaign
  alter column phase set default 'identification';
