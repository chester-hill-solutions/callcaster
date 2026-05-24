import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createWorkspaceTwilioInstance, safeParseJson } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber as sharedNormalizePhoneNumber } from "@/lib/utils";
import type { Call } from '@/lib/types';
import type { Database } from '@/lib/database.types';
import type TwilioSDK from "twilio";

type TwilioClient = TwilioSDK.Twilio;

export const normalizePhoneNumber = sharedNormalizePhoneNumber;

export async function getNextAutoDialQueueContact(
  supabase: SupabaseClient,
  campaign_id: number,
  user_id: string,
) {
  const { data: record, error } = await supabase.rpc("auto_dial_queue", {
    campaign_id_variable: campaign_id,
    user_id_variable: user_id,
  });
  if (error) throw error;
  return record.length > 0 ? record[0] : null;
}

export async function createOutreachAttempt(
  supabase: SupabaseClient,
  contactRecord: { queue_id: number, contact_id: number, contact_phone: string }, 
  campaign_id: number,
  workspace_id: string,
  user_id: string,
) {
  const { data: outreachAttempt, error } = await supabase.rpc(
    "create_outreach_attempt",
    {
      con_id: contactRecord.contact_id,
      cam_id: campaign_id,
      queue_id: contactRecord.queue_id,
      wks_id: workspace_id,
      usr_id: user_id,
    },
  );
  if (error) throw error;
  return outreachAttempt;
}

export async function createTwilioCall(
  client: TwilioClient,
  toNumber: string,
  fromNumber: string,
  user_id: string,
  selected_device: string,
) {
  return await client.calls.create({
    to: toNumber,
    from: fromNumber,
    url: `${env.BASE_URL()}/api/auto-dial/${user_id}`,
    machineDetection: "Enable",
    statusCallbackEvent: ["answered", "completed", "ringing"],
    statusCallback: `${env.BASE_URL()}/api/auto-dial/status`,
  });
}

export async function saveCallToDatabase(
  supabase: SupabaseClient<Database>,
  callData: Partial<Call>
) {
  if (!callData.sid) {
    logger.error("Cannot save call without sid");
    return;
  }
  
  const insertData: Database['public']['Tables']['call']['Insert'] = {
    sid: callData.sid,
    account_sid: callData.account_sid || null,
    to: callData.to || null,
    from: callData.from || null,
    status: (callData.status as Database['public']['Enums']['call_status']) || null,
    start_time: callData.start_time ? new Date(callData.start_time).toISOString() : null,
    end_time: callData.end_time ? new Date(callData.end_time).toISOString() : null,
    duration: callData.duration ? String(callData.duration) : null,
    price: callData.price ? String(callData.price) : null,
    direction: callData.direction || null,
    answered_by: (callData.answered_by as Database['public']['Enums']['answered_by']) || null,
    api_version: callData.api_version || null,
    forwarded_from: callData.forwarded_from || null,
    group_sid: callData.group_sid || null,
    caller_name: callData.caller_name || null,
    uri: callData.uri || null,
    campaign_id: callData.campaign_id || null,
    contact_id: callData.contact_id || null,
    workspace: callData.workspace || null,
    outreach_attempt_id: callData.outreach_attempt_id || null,
    conference_id: callData.conference_id || null,
    phone_number_sid: callData.phone_number_sid || null,
    parent_call_sid: callData.parent_call_sid || null,
  };
  
  const { error } = await supabase
    .from("call")
    .upsert(insertData)
    .select();
  if (error) logger.error("Error saving the call to the database:", error);
}

export async function completeAllConferences(client: TwilioClient, user_id: string) {
  const conferences = await client.conferences.list({
    friendlyName: user_id,
    status: "in-progress" as const,
  });
  await Promise.all(
    conferences.map(({ sid }) =>
      client.conferences(sid).update({ status: "completed" as const }),
    ),
  );
}
