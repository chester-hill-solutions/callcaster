-- Recording is requested by the same one-shot customer Call create operation.
begin;
alter table public.workspace_voice_reservation
  add column customer_recording_id uuid,
  add column customer_recording_callback text;

alter table public.workspace_voice_reservation
  add constraint voice_customer_recording_launch check (
    (customer_recording_id is null and customer_recording_callback is null)
    or (customer_recording_id is not null and customer_recording_callback is not null
      and audio_connection_id is not null)
  );

create unique index voice_customer_recording_launch_id
  on public.workspace_voice_reservation(customer_recording_id)
  where customer_recording_id is not null;
commit;
