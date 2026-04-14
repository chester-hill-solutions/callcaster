-- Call-in verification sessions for 2FA
-- Users call the shared verification number; we match caller ID to expected_caller
create table if not exists public.verification_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user(id) on delete cascade,
  expected_caller text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists verification_session_expected_caller_idx
  on public.verification_session(expected_caller)
  where status = 'pending';

create index if not exists verification_session_expires_at_idx
  on public.verification_session(expires_at)
  where status = 'pending';

-- RLS
alter table public.verification_session enable row level security;

drop policy if exists "Users can insert own verification sessions" on public.verification_session;
drop policy if exists "Service role can manage verification sessions" on public.verification_session;

create policy "Users can insert own verification sessions"
  on public.verification_session for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Service role can manage verification sessions"
  on public.verification_session for all
  to service_role
  using (true)
  with check (true);
