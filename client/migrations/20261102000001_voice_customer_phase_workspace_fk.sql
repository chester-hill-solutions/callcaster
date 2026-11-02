-- Tenant cleanup must also work when workspace deletion reaches receipts first.
alter table public.workspace_voice_customer_phase_event
  add constraint workspace_voice_customer_phase_event_workspace_fkey
  foreign key (workspace) references public.workspace(id) on delete cascade;
