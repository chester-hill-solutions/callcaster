-- Submitted requests survive lost replies and can be canceled before admission.
-- A connection can be reused without granting an older request new controls.
alter table public.workspace_voice_audio_connection
  add column if not exists control_intent_id uuid;

create table if not exists public.workspace_voice_audio_intent (
  workspace uuid not null references public.workspace(id) on delete cascade,
  user_id text not null,
  intent_id uuid not null,
  request jsonb check (request is null or jsonb_typeof(request) = 'object'),
  connection_id uuid references public.workspace_voice_audio_connection(id) on delete set null,
  cancel_requested_at timestamptz,
  created_at timestamptz not null default now(),
  constraint voice_audio_intent_control_pk primary key (workspace, user_id, intent_id),
  constraint voice_audio_intent_request check (request is not null or cancel_requested_at is not null)
);
create index if not exists voice_audio_intent_connection
  on public.workspace_voice_audio_intent(connection_id) where connection_id is not null;

update public.workspace_voice_audio_connection
  set control_intent_id = intent_id where control_intent_id is null;

insert into public.workspace_voice_audio_intent
  (workspace, user_id, intent_id, request, connection_id, cancel_requested_at, created_at)
select workspace, user_id, intent_id,
  jsonb_build_object(
    'transport', transport,
    'destination', case when transport = 'phone' then destination else null end,
    'callSid', requested_call_sid,
    'expectedAgentSid', case when requested_call_sid is not null then source_agent_sid else null end,
    'campaignId', case when requested_call_sid is null then campaign_id else null end
  ), id, cancel_requested_at, created_at
from public.workspace_voice_audio_connection
on conflict (workspace, user_id, intent_id) do nothing;
