-- Optional x-cron-secret header for number-rental-billing when app.settings.number_rental_cron_secret is set.
-- Edge secret NUMBER_RENTAL_CRON_SECRET must match the database GUC value.

do $$
declare
  edge_base_url text;
  function_url text;
  cron_secret text;
  cron_command text;
  job_id bigint;
begin
  select jobid into job_id
  from cron.job
  where jobname = 'number_rental_billing_daily';

  if job_id is null then
    raise notice 'number_rental_billing_daily not found, skipping';
    return;
  end if;

  edge_base_url := nullif(trim(both from coalesce(
    nullif(trim(both from current_setting('app.settings.edge_functions_base_url', true)), ''),
    nullif(trim(both from current_setting('app.settings.supabase_functions_url', true)), ''),
    'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1'
  )), '');

  if edge_base_url is null then
    raise notice 'No edge function base URL configured; skipping number rental cron header update';
    return;
  end if;

  cron_secret := nullif(trim(both from current_setting('app.settings.number_rental_cron_secret', true)), '');
  function_url := rtrim(edge_base_url, '/') || '/number-rental-billing';

  if cron_secret is null then
    raise notice 'number_rental_cron_secret GUC not set; leaving existing cron headers unchanged';
    return;
  end if;

  cron_command := format(
    $cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb
      );
    $cmd$,
    function_url,
    cron_secret
  );

  perform cron.unschedule(job_id);
  perform public.create_cron_job(
    p_job_name := 'number_rental_billing_daily',
    p_schedule := '15 3 * * *',
    p_command := cron_command
  );
end
$$;
