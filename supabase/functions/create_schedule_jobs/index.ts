import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
};

const createCronJobsStructure = async (schedule, supabase) => {
  const {data, error} = await supabase.rpc('generate_cron_expressions', {schedule});
  if (error) throw error;
  return data;
};

const createCronJob = async (supabase, jobName, schedule, command) => {
  const { data, error } = await supabase.rpc('create_cron_job', {
    p_job_name: jobName,
    p_schedule: schedule,
    p_command: command
  });
  if (error) {
    console.error('Error creating cron job:', error);
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error('Failed to create cron job: No data returned');
  }
  return data[0].job_id;
};

const storeJobIds = async (supabase, campaignId, startJobId, endJobId) => {
  const { data, error } = await supabase.from('campaign_schedule_jobs')
    .upsert({ campaign_id: campaignId, start_job_id: startJobId, end_job_id: endJobId })
    .select();
  if (error) throw error;
  return data;
};

Deno.serve(async (req) => {
  const { record } = await req.json();
  const supabase = initSupabaseClient();
  try {
    const structures = await createCronJobsStructure(record.schedule, supabase);
    if (structures && structures.length > 0) {
      const { start_cron, end_cron } = structures[0];
      const startJobId = await createCronJob(
        supabase,
        `campaign_start_${record.id}`,
        start_cron,
        `UPDATE public.campaign SET is_active = true WHERE id = ${record.id}`
      );

      const endJobId = await createCronJob(
        supabase,
        `campaign_end_${record.id}`,
        end_cron,
        `UPDATE public.campaign SET is_active = false WHERE id = ${record.id}`
      );
      await storeJobIds(supabase, record.id, startJobId, endJobId);

      return new Response(
        JSON.stringify({ startJobId, endJobId }),
        { headers: { "Content-Type": "application/json" } }
      );
    } else {
      throw new Error("No cron structures generated");
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, details: error.details }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});