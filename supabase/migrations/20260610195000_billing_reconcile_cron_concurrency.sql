-- Pass concurrency in nightly reconcile cron body so full workspace scan finishes under Edge timeout.
-- Preserves existing cron auth headers (prod may use anon JWT when GUCs are unset).
do $$
declare
  edge_base_url text;
  function_url text;
  cron_command text;
  service_jwt text;
  headers jsonb;
  job_id bigint;
  existing_command text;
  default_edge constant text := 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1';
begin
  select jobid, command into job_id, existing_command
  from cron.job
  where jobname = 'twilio_billing_reconcile_daily';

  if job_id is null then
    raise notice 'twilio_billing_reconcile_daily not found, skipping';
    return;
  end if;

  if existing_command like '%"concurrency":10%' then
    raise notice 'twilio_billing_reconcile_daily already passes concurrency, skipping';
    return;
  end if;

  edge_base_url := nullif(trim(both from coalesce(
    nullif(trim(both from current_setting('app.settings.edge_functions_base_url', true)), ''),
    nullif(trim(both from current_setting('app.settings.supabase_functions_url', true)), ''),
    default_edge
  )), '');

  service_jwt := nullif(trim(both from current_setting('app.settings.supabase_service_role_jwt', true)), '');

  if service_jwt is not null and service_jwt <> '' then
    function_url := rtrim(edge_base_url, '/') || '/twilio-billing-reconcile';

    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_jwt
    );

    cron_command :=
      'select net.http_post('
      || 'url := ' || quote_literal(function_url)
      || ', headers := ' || quote_literal(headers::text) || '::jsonb'
      || ', body := ''{"concurrency":10}''::jsonb'
      || ');';

    perform cron.unschedule(job_id);
    perform public.create_cron_job(
      p_job_name := 'twilio_billing_reconcile_daily',
      p_schedule := '30 4 * * *',
      p_command := cron_command
    );
    return;
  end if;

  cron_command := replace(
    existing_command,
    'body := ''{}''::jsonb',
    'body := ''{"concurrency":10}''::jsonb'
  );

  if cron_command = existing_command then
    raise notice 'twilio_billing_reconcile_daily body not updated (unexpected command shape)';
    return;
  end if;

  perform cron.unschedule(job_id);
  perform public.create_cron_job(
    p_job_name := 'twilio_billing_reconcile_daily',
    p_schedule := '30 4 * * *',
    p_command := cron_command
  );
end
$$;
