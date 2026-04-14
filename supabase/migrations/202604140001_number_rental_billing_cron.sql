do $$
declare
  job_exists boolean;
  edge_base_url text;
  function_url text;
  cron_command text;
begin
  select exists(
    select 1
    from public.get_active_cron_jobs()
    where jobname = 'number_rental_billing_daily'
  ) into job_exists;

  if job_exists then
    raise notice 'number_rental_billing_daily already exists, skipping';
    return;
  end if;

  edge_base_url := nullif(current_setting('app.settings.edge_functions_base_url', true), '');
  if edge_base_url is null then
    edge_base_url := nullif(current_setting('app.settings.supabase_functions_url', true), '');
  end if;

  if edge_base_url is null then
    raise notice 'No edge function base URL configured; skipping cron registration';
    return;
  end if;

  function_url := rtrim(edge_base_url, '/') || '/number-rental-billing';

  cron_command := format(
    $cmd$
      select net.http_post(
        url := %L,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cmd$,
    function_url
  );

  perform public.create_cron_job(
    p_job_name := 'number_rental_billing_daily',
    p_schedule := '15 3 * * *',
    p_command := cron_command
  );
end
$$;
