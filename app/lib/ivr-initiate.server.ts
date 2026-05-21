import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import {
  createWorkspaceTwilioInstance,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { buildDequeuedQueueUpdate } from "@/lib/queue-status";
import { logger } from "@/lib/logger.server";
import type { Database } from "@/lib/database.types";
export type InitiateIvrContact = {
  id: number;
  contact_id: number;
  phone: string;
  caller_id: string;
};

export type InitiateIvrCallInput = {
  userSupabase: SupabaseClient;
  user: { id: string };
  workspace_id: string;
  campaign_id: number;
  contact: InitiateIvrContact;
  user_id: string;
};

export type InitiateIvrCallResult =
  | { success: true; callSid: string }
  | { success: false; creditsError: true }
  | { success: false; error: string };

export async function initiateIvrCall(
  input: InitiateIvrCallInput,
): Promise<InitiateIvrCallResult> {
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );

  await requireWorkspaceAccess({
    supabaseClient: input.userSupabase,
    user: input.user,
    workspaceId: input.workspace_id,
  });

  const twilio = await createWorkspaceTwilioInstance({
    supabase,
    workspace_id: input.workspace_id,
  });

  const { data: outreachAttemptId, error: outreachError } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: input.contact.contact_id,
      cam_id: input.campaign_id,
      wks_id: input.workspace_id,
      queue_id: input.contact.id,
      usr_id: input.user_id,
    },
  );

  if (outreachError) {
    logger.error("initiateIvrCall outreach error", outreachError);
    return { success: false, error: outreachError.message };
  }

  try {
    const call = await twilio.calls.create({
      to: input.contact.phone,
      from: input.contact.caller_id,
      url: `${env.BASE_URL()}/api/ivr/${input.campaign_id}/page_1/`,
      machineDetection: "Enable",
      statusCallbackEvent: ["answered", "completed"],
      statusCallback: `${env.BASE_URL()}/api/ivr/status`,
    });

    const { error: insertError } = await supabase.from("call").insert({
      sid: call.sid,
      to: input.contact.phone,
      from: input.contact.caller_id,
      campaign_id: input.campaign_id,
      contact_id: input.contact.contact_id,
      workspace: input.workspace_id,
      outreach_attempt_id: outreachAttemptId,
    });

    if (insertError) {
      logger.error("initiateIvrCall call insert error", insertError);
      return { success: false, error: insertError.message };
    }

    const { error: dequeueError } = await supabase
      .from("campaign_queue")
      .update(buildDequeuedQueueUpdate(input.user_id, "IVR call completed"))
      .eq("id", input.contact.id);

    if (dequeueError) {
      logger.error("initiateIvrCall dequeue error", dequeueError);
      return { success: false, error: dequeueError.message };
    }

    return { success: true, callSid: call.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("credit")) {
      return { success: false, creditsError: true };
    }
    logger.error("initiateIvrCall Twilio error", error);
    return { success: false, error: message };
  }
}
