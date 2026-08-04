-- ADR-0019: 1-5 voter support scale as typed disposition.
-- The telephony `disposition` (call outcome) is preserved; `support_level`
-- captures the *voter contact result* (1=Strong Support ... 5=Strong Opposition).
-- Modeled as a smallint with a CHECK constraint so callers can write plain
-- integers without casting an enum.

alter table public.outreach_attempt
  add column if not exists support_level smallint
  check (support_level is null or support_level between 1 and 5);

alter table public.contact
  add column if not exists support_level smallint
  check (support_level is null or support_level between 1 and 5);

-- Index the contact cache for phase-scoped targeting (Persuasion -> 3, GOTV -> 1,2).
create index if not exists contact_support_level_idx
  on public.contact (support_level)
  where support_level is not null;
