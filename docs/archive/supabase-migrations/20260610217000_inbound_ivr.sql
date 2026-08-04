alter table public.workspace_number
  add column if not exists inbound_script_id bigint
  references public.script(id) on delete set null;

create index if not exists workspace_number_inbound_script_id_idx
  on public.workspace_number(inbound_script_id);
