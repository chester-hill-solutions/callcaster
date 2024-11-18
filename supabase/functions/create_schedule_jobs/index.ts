import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

const initSupabaseClient = () => {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
};

const generateCronExpressions = async (schedule, supabase) => {
  const { data, error } = await supabase.rpc('generate_cron_expressions', { schedule });
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
  return data[0].job_id;
};

const storeJobIds = async (supabase, campaignId, startJobIds, endJobIds) => {
  const { data, error } = await supabase.from('campaign_schedule_jobs')
    .upsert({ 
      campaign_id: campaignId, 
      start_ids: startJobIds, 
      end_ids: endJobIds 
    })
    .select();
  if (error) throw error;
  return data;
};

const splitCronExpressions = (cronString: string): string[] => {
  return cronString.split('|').map(expr => expr.trim());
};

Deno.serve(async (req) => {
  const { record } = await req.json();
  const supabase = initSupabaseClient();
  try {
    const cronExpressions = await generateCronExpressions(record.schedule, supabase);
    if (cronExpressions && cronExpressions.length > 0) {
      const startJobIds = [];
      const endJobIds = [];

      for (const { start_cron, end_cron } of cronExpressions) {
        const startSchedules = splitCronExpressions(start_cron);
        const endSchedules = splitCronExpressions(end_cron);

        for (let i = 0; i < startSchedules.length; i++) {
          const startJobId = await createCronJob(
            supabase,
            `campaign_start_${record.id}_${i}`,
            startSchedules[i],
            `UPDATE public.campaign SET is_active = true WHERE id = ${record.id} AND status = 'scheduled'`
          );
          startJobIds.push(startJobId);
        }

        for (let i = 0; i < endSchedules.length; i++) {
          const endJobId = await createCronJob(
            supabase,
            `campaign_end_${record.id}_${i}`,
            endSchedules[i],
            `UPDATE public.campaign SET is_active = false WHERE id = ${record.id} AND status = 'scheduled'`
          );
          endJobIds.push(endJobId);
        }
      }

      await storeJobIds(supabase, record.id, startJobIds, endJobIds);

      return new Response(
        JSON.stringify({ startJobIds, endJobIds }),
        { headers: { "Content-Type": "application/json" } }
      );
    } else {
      throw new Error("No cron expressions generated");
    }
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof Error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: "An unknown error occurred" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }
});