import { buildDequeuedQueueUpdate } from "@/lib/queue-status";
import { createClient } from "@supabase/supabase-js";
import { createErrorResponse } from "@/lib/errors.server";
import { createWorkspaceTwilioInstance, requireWorkspaceAccess } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { getAuthSupabaseClient, requireJsonAuth } from "@/lib/api-auth.server";

import type { ActionFunctionArgs } from "react-router";

export const action = async ({ request }:ActionFunctionArgs) => {

  const auth = await requireJsonAuth(request);
  if (auth instanceof Response) return auth;
  const userSupabase = getAuthSupabaseClient(auth);
  const user = auth.user;
  const supabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
  const formData = await request.formData();

  const to_number = formData.get("to_number") as string;
  const campaign_id = formData.get("campaign_id") as string;
  const workspace_id = formData.get("workspace_id") as string;
  const contact_id = formData.get("contact_id") as string;
  const caller_id = formData.get("caller_id") as string;
  const queue_id = formData.get("queue_id") as string;
  const user_id = formData.get("user_id") as string;
  if (!workspace_id || !campaign_id || !contact_id || !caller_id || !queue_id || !user_id) {
    throw new Error("Missing required form data");
  }
  let outreachAttemptId;
  let call;
  const twilio = await createWorkspaceTwilioInstance({ supabase: supabase,
    workspace_id,
  });

  try {
    await requireWorkspaceAccess({ supabaseClient: userSupabase, user, workspaceId: workspace_id });
    const { data, error: outreachError } = await supabase.rpc(
      "create_outreach_attempt",
      {
        con_id: contact_id,
        cam_id: campaign_id,
        wks_id: workspace_id,
        queue_id: queue_id,
        usr_id: user_id,
      },
    );

    if (outreachError) throw outreachError;
    outreachAttemptId = data;

    call = await withTwilioRetry(
      () =>
        twilio.calls.create({
          to: to_number,
          from: caller_id,
          url: `${env.BASE_URL()}/api/ivr/${campaign_id}/page_1/`,
          machineDetection: "Enable",
          statusCallbackEvent: ["answered", "completed"],
          statusCallback: `${env.BASE_URL()}/api/ivr/status`,
        }),
      { workspaceId: workspace_id, operation: "calls.create" },
    );

    
    const { error: insertError } = await supabase.from("call").insert({
      sid: call.sid,
      to: to_number,
      from: caller_id,
      campaign_id,
      contact_id,
      workspace: workspace_id,
      outreach_attempt_id: outreachAttemptId,
    }).select();

    if (insertError) throw insertError;

    // Dequeue
    const { error: dequeueError } = await supabase
      .from("campaign_queue")
      .update(buildDequeuedQueueUpdate(user_id, "IVR call completed", { includeNormalizedFields: true }))
      .eq("id", queue_id);
      
    if (dequeueError) throw dequeueError;

    return new Response(JSON.stringify({ success: true, callSid: call.sid }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    logger.error("Error processing IVR request:", error);
    return createErrorResponse(error, "Error processing IVR request");
  }
}
