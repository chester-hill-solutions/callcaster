import { createClient } from "npm:@supabase/supabase-js@^2.39.6";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const { data, error } = await supabase.rpc('get_last_online');

  if (error) {
    console.error('Error fetching data from RPC:', error);
    return new Response(
      JSON.stringify({ error: 'Error fetching data' }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }

  const isExpired = (date) => {
    if (!date) return true;
    return (new Date(date).getTime() + 900000) < now.getTime();
  }

  try {
    await Promise.all(data.map(async (campaignUser) => {
      if (campaignUser.dial_type !== 'call') return;
      if (!isExpired(campaignUser.last_online)) return;

      const { error: updateError } = await supabase
        .from('campaign_queue')
        .update({ status: 'queued' })
        .eq('campaign_id', campaignUser.campaign_id)
        .eq('status', campaignUser.status);

      if (updateError) {
        console.error('Error updating user:', updateError);
      }
    }));
  } catch (error) {
    console.error('Error updating:', error);
    return new Response(
      JSON.stringify({ error: 'Error updating data' }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }

  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } },
  );
});
