-- Indexes to keep conversation list contact lookups fast (batched by workspace.server fetchConversationSummary).
-- Uses the actual workspace column name (workspace or workspace_id) from the contact table.
do $$
declare
  workspace_col text;
begin
  select c.column_name into workspace_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'contact'
    and c.column_name in ('workspace', 'workspace_id')
  limit 1;

  if workspace_col is not null then
    execute format(
      'create index if not exists idx_contact_workspace_id on public.contact (%I, id)',
      workspace_col
    );
    execute format(
      'create index if not exists idx_contact_workspace_normalised_phone on public.contact (%I, (public.normalise_phone_key(phone)))',
      workspace_col
    );
  else
    raise notice 'contact_conversation_indexes: no column workspace or workspace_id on public.contact; skipping indexes. Add them manually if your workspace column has another name.';
  end if;
end
$$;
