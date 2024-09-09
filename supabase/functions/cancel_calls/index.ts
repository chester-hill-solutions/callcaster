import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const batchSize = 1000 
    let lastId = 0
    let processedCalls = 0

    while (true) {
      const { data: activeCalls, error: activeCallsError } = await supabase
        .from('call')
        .select('id, sid, workspace')
        .gt('id', lastId)
        .in('status', ['queued', 'ringing', 'in-progress'])
        .order('id', { ascending: true })
        .limit(batchSize)

      if (activeCallsError) throw activeCallsError
      if (!activeCalls || activeCalls.length === 0) break

      const { error: updateCallError } = await supabase
        .from('call')
        .update({ 
          status: 'canceled', 
          end_time: new Date().toISOString()
        })
        .in('id', activeCalls.map(call => call.id))

      if (updateCallError) throw updateCallError

      const { error: updateOutreachError } = await supabase
        .rpc('cancel_outreach_attempts', { 
          call_ids: activeCalls.map(call => call.id) 
        })

      if (updateOutreachError) throw updateOutreachError

      processedCalls += activeCalls.length
      lastId = activeCalls[activeCalls.length - 1].id

      await queueTwilioCancellations(supabase, activeCalls)
    }

    return new Response(
      JSON.stringify({ message: `Processed ${processedCalls} calls` }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error('Error canceling outstanding calls:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})

async function queueTwilioCancellations(supabase, calls) {
  const { error } = await supabase
    .from('twilio_cancellation_queue')
    .insert(calls.map(call => ({
      call_sid: call.sid,
      workspace: call.workspace
    })))
  
  if (error) throw error
}