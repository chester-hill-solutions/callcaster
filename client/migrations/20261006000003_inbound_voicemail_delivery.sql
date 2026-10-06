create table if not exists public.inbound_voicemail_recipient (
  call_sid text primary key references public.call(sid) on delete cascade,
  workspace uuid not null references public.workspace(id) on delete cascade,
  phone_number text not null,
  recipient text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.inbound_voicemail_delivery (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  call_sid text not null references public.call(sid) on delete cascade,
  recording_sid text not null,
  recording_url text not null,
  phone_number text not null,
  recipient text not null,
  signed_url text not null,
  email_payload jsonb not null,
  state text not null default 'prepared' check (state in ('prepared', 'sending', 'sent', 'uncertain')),
  first_send_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  resend_email_id text,
  last_error text,
  created_at timestamptz not null default now(),
  unique (workspace, call_sid, recording_sid),
  check ((lease_token is null) = (lease_until is null)),
  check (state <> 'sending' or (first_send_at is not null and lease_token is not null)),
  check (state <> 'sent' or (sent_at is not null and resend_email_id is not null))
);
