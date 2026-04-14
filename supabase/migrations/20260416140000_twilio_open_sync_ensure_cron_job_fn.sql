-- Idempotent registration for pg_cron → net.http_post → Edge `twilio-open-sync`.
-- On Supabase Cloud, `ALTER DATABASE ... SET app.settings.*` usually requires the dashboard SQL editor (superuser).
-- Optional GUCs (when set, they override the built-in default Edge URL in this function):
--   app.settings.edge_functions_base_url, app.settings.supabase_functions_url
-- Service role JWT (required once before the cron job can be created):
--   app.settings.supabase_service_role_jwt  — legacy service_role JWT from Dashboard → Project Settings → API
-- After setting JWT in SQL editor:
--   SELECT public.ensure_twilio_open_sync_cron_job();
-- Or pass the base URL explicitly:
--   SELECT public.ensure_twilio_open_sync_cron_job('https://<project-ref>.supabase.co/functions/v1');

create or replace function public.ensure_twilio_open_sync_cron_job(p_edge_base_url text default null)
returns text
language plpgsql
security definer
set search_path to public, cron, extensions
as $fn$
declare
  job_exists boolean;
  edge_base_url text;
  function_url text;
  cron_command text;
  service_jwt text;
  headers jsonb;
  default_edge constant text := 'https://nolrdvpusfcsjihzhnlp.supabase.co/functions/v1';
begin
  select exists(
    select 1 from cron.job j where j.jobname = 'twilio_open_sync_every_5m'
  ) into job_exists;

  if job_exists then
    return 'already_exists';
  end if;

  edge_base_url := nullif(trim(both from coalesce(
    nullif(trim(both from p_edge_base_url), ''),
    nullif(trim(both from current_setting('app.settings.edge_functions_base_url', true)), ''),
    nullif(trim(both from current_setting('app.settings.supabase_functions_url', true)), ''),
    default_edge
  )), '');

  if edge_base_url is null then
    return 'missing_edge_url';
  end if;

  service_jwt := nullif(trim(both from current_setting('app.settings.supabase_service_role_jwt', true)), '');
  if service_jwt is null or service_jwt = '' then
    return 'missing_service_role_jwt';
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

  return 'created';
exception
  when others then
    return 'error:' || sqlerrm;
end
$fn$;

revoke all on function public.ensure_twilio_open_sync_cron_job(text) from public;
grant execute on function public.ensure_twilio_open_sync_cron_job(text) to postgres;
grant execute on function public.ensure_twilio_open_sync_cron_job(text) to service_role;

-- Try once after migration (no-op if JWT still unset).
select public.ensure_twilio_open_sync_cron_job();
