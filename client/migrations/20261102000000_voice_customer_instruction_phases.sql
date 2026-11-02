-- A new capability is granted with its joining instruction, never from old events.
alter table public.workspace_voice_reservation add column customer_phase_id uuid;

create table public.workspace_voice_customer_phase (
  id uuid primary key,
  workspace uuid not null references public.workspace(id) on delete cascade,
  reservation_id uuid not null unique references public.workspace_voice_reservation(id) on delete cascade,
  user_id text not null,
  capability text not null check (capability = 'phone-conference-v1'),
  logical_call_sid text not null check (logical_call_sid ~* '^CA[0-9a-f]{32}$'),
  customer_call_sid text not null check (customer_call_sid = logical_call_sid),
  account_sid text not null check (account_sid ~* '^AC[0-9a-f]{32}$'),
  audio_connection_id uuid not null,
  audio_generation integer not null check (audio_generation > 0),
  conference_sid text not null check (conference_sid ~* '^CF[0-9a-f]{32}$'),
  conference_name text not null check (length(conference_name) > 0),
  callback_url text not null check (length(callback_url) > 0),
  recording_operation_id uuid not null,
  participant_label text not null check (participant_label = 'customer:v1:' || reservation_id::text || ':' || id::text),
  instruction_digest text not null check (instruction_digest ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default clock_timestamp(),
  unique (id, reservation_id, workspace),
  unique (id, workspace)
);
alter table public.workspace_voice_reservation add constraint voice_customer_phase_link
  foreign key (customer_phase_id, id, workspace)
  references public.workspace_voice_customer_phase(id, reservation_id, workspace)
  deferrable initially deferred;

create function public.guard_voice_customer_phase_grant() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.customer_phase_id is not null then raise exception 'Customer phase requires its later instruction grant'; end if;
    return new;
  end if;
  if new.customer_phase_id is distinct from old.customer_phase_id and
    (old.customer_phase_id is not null or old.recipient_instruction_issued_at is not null or
      new.customer_phase_id is null or new.recipient_instruction_issued_at is null) then
    raise exception 'Customer phase must be saved with its first instruction';
  end if;
  if old.recipient_instruction_issued_at is not null and new.recipient_instruction_issued_at is distinct from old.recipient_instruction_issued_at then
    raise exception 'Customer phase instruction is immutable';
  end if;
  return new;
end $$;
create trigger voice_customer_phase_grant before insert or update on public.workspace_voice_reservation
  for each row execute function public.guard_voice_customer_phase_grant();

create function public.bind_voice_customer_phase() returns trigger language plpgsql as $$
declare r public.workspace_voice_reservation%rowtype;
begin
  select * into r from public.workspace_voice_reservation where id = new.reservation_id;
  if not found or r.customer_phase_id is distinct from new.id or r.recipient_instruction_issued_at is null or
    r.workspace is distinct from new.workspace or r.user_id is distinct from new.user_id or
    r.account_sid is distinct from new.account_sid or r.provider_sid is distinct from new.customer_call_sid or
    r.audio_connection_id is distinct from new.audio_connection_id or r.audio_generation is distinct from new.audio_generation or
    r.conference_id is distinct from new.conference_name or r.conference_sid is distinct from new.conference_sid or
    r.audio_conference_callback is distinct from new.callback_url or r.customer_recording_id is distinct from new.recording_operation_id or
    r.audio_mode is null or r.audio_mode not in ('manual', 'predictive') or r.setup_sid is not null or r.terminal_status is not null or
    r.kind <> 'staffed' or r.state not in ('creating', 'active') or r.send_started_at is null or r.recipient_refused_at is not null then
    raise exception 'Customer phase has a different instruction owner';
  end if;
  if not exists (select 1 from public.workspace_voice_recording_operation p where p.id = new.recording_operation_id
    and p.workspace = r.workspace and p.reservation_id = r.id and p.user_id = r.user_id and p.account_sid = r.account_sid
    and p.kind = 'customer' and p.intent_id = r.id and p.logical_call_sid = r.provider_sid and p.source_call_sid = r.provider_sid
    and p.source_parent_sid is null and p.source_to = r.recipient and p.source_from = r.caller_id
    and p.source_direction = 'outbound-api' and p.callback_url = r.customer_recording_callback and p.send_started_at is not null) then
    raise exception 'Customer phase has no matching capture instruction';
  end if;
  new.issued_at := r.recipient_instruction_issued_at;
  return new;
end $$;
create trigger voice_customer_phase_owner before insert on public.workspace_voice_customer_phase
  for each row execute function public.bind_voice_customer_phase();

create table public.workspace_voice_customer_phase_event (
  id uuid primary key,
  workspace uuid not null,
  phase_id uuid not null,
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz check (occurred_at is null or isfinite(occurred_at)),
  sequence_number integer check (sequence_number >= 0),
  received_at timestamptz not null default clock_timestamp(),
  foreign key (phase_id, workspace) references public.workspace_voice_customer_phase(id, workspace) on delete cascade,
  unique (phase_id, fingerprint)
);
create index voice_customer_phase_history on public.workspace_voice_customer_phase_event(workspace, phase_id);

create function public.keep_voice_customer_phase_history() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'Customer phase history is immutable'; end if;
  if not exists (select 1 from public.workspace where id = old.workspace) then return old; end if;
  if tg_table_name = 'workspace_voice_customer_phase' then
    if exists (select 1 from public.workspace_voice_reservation where id = old.reservation_id) then
      raise exception 'Customer phase history belongs to its reservation';
    end if;
  elsif exists (select 1 from public.workspace_voice_customer_phase where id = old.phase_id) then
    raise exception 'Customer phase event belongs to its phase';
  end if;
  return old;
end $$;
create trigger voice_customer_phase_history before update or delete on public.workspace_voice_customer_phase
  for each row execute function public.keep_voice_customer_phase_history();
create trigger voice_customer_phase_event_history before update or delete on public.workspace_voice_customer_phase_event
  for each row execute function public.keep_voice_customer_phase_history();
