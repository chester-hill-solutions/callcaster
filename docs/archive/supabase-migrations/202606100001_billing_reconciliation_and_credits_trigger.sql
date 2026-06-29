-- Capture credits trigger in repo (may already exist in production).
create or replace function public.transaction_history_update_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace
  set credits = coalesce(credits, 0) + new.amount
  where id = new.workspace;
  return new;
end;
$$;

drop trigger if exists transaction_history_update_credits on public.transaction_history;
create trigger transaction_history_update_credits
  after insert on public.transaction_history
  for each row
  execute function public.transaction_history_update_credits();

-- Nightly Twilio vs ledger reconciliation (admin observability).
do $$
declare
  job_exists boolean;
  edge_base_url text;
  function_url text;
  cron_command text;
  service_jwt text;
  headers jsonb;
begin
  select exists(
    select 1 from cron.job j where j.jobname = 'twilio_billing_reconcile_daily'
  ) into job_exists;

  if job_exists then
    raise notice 'twilio_billing_reconcile_daily already exists, skipping';
    return;
  end if;

  edge_base_url := nullif(current_setting('app.settings.edge_functions_base_url', true), '');
  if edge_base_url is null then
    edge_base_url := nullif(current_setting('app.settings.supabase_functions_url', true), '');
  end if;

  if edge_base_url is null then
    raise notice 'No edge function base URL configured; skipping twilio_billing_reconcile cron registration';
    return;
  end if;

  service_jwt := nullif(trim(both from current_setting('app.settings.supabase_service_role_jwt', true)), '');
  if service_jwt is null or service_jwt = '' then
    raise notice 'app.settings.supabase_service_role_jwt not set; skipping twilio_billing_reconcile cron registration';
    return;
  end if;

  function_url := rtrim(edge_base_url, '/') || '/twilio-billing-reconcile';

  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || service_jwt
  );

  cron_command :=
    'select net.http_post('
    || 'url := ' || quote_literal(function_url)
    || ', headers := ' || quote_literal(headers::text) || '::jsonb'
    || ', body := ''{}''::jsonb'
    || ');';

  perform public.create_cron_job(
    p_job_name := 'twilio_billing_reconcile_daily',
    p_schedule := '30 4 * * *',
    p_command := cron_command
  );
end
$$;
