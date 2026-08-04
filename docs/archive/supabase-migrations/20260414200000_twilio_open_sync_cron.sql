-- Registers pg_cron → net.http_post → Edge function `twilio-open-sync`.
-- Auth: standard Supabase JWT verification (default verify_jwt). Cron sends
--   Authorization: Bearer <service_role JWT>
-- Set once per environment (not committed to git):
--   ALTER DATABASE postgres SET app.settings.supabase_service_role_jwt = 'eyJ...';
-- Use the same legacy service_role JWT as Dashboard → Project Settings → API.

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
    select 1 from cron.job j where j.jobname = 'twilio_open_sync_every_5m'
  ) into job_exists;

  if job_exists then
    raise notice 'twilio_open_sync_every_5m already exists, skipping';
    return;
  end if;

  edge_base_url := nullif(current_setting('app.settings.edge_functions_base_url', true), '');
  if edge_base_url is null then
    edge_base_url := nullif(current_setting('app.settings.supabase_functions_url', true), '');
  end if;

  if edge_base_url is null then
    raise notice 'No edge function base URL configured; skipping twilio_open_sync cron registration';
    return;
  end if;

  service_jwt := nullif(trim(both from current_setting('app.settings.supabase_service_role_jwt', true)), '');
  if service_jwt is null or service_jwt = '' then
    raise notice 'app.settings.supabase_service_role_jwt not set; skipping twilio_open_sync cron registration';
    return;
  end if;

  function_url := rtrim(edge_base_url, '/') || '/twilio-open-sync';

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
    p_job_name := 'twilio_open_sync_every_5m',
    p_schedule := '*/5 * * * *',
    p_command := cron_command
  );
end
$$;
