import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { normalizePhoneNumber as sharedNormalizePhoneNumber } from "@/lib/utils";
import type { Call } from '@/lib/types';
import type TwilioSDK from "twilio";
import { call as callTable } from "@/db/schema";
import { createTenantDb, type TenantDb } from "@/server/tenant-db";
import { eq } from "drizzle-orm";
import {
  rpcAutoDialQueue,
  rpcCreateOutreachAttempt,
} from "@/lib/db-rpc.server";
import { db } from "@/server/db";

type TwilioClient = TwilioSDK.Twilio;

export const normalizePhoneNumber = sharedNormalizePhoneNumber;

export async function getNextAutoDialQueueContact(
  campaign_id: number,
  user_id: string,
) {
  return rpcAutoDialQueue(db, { campaignId: campaign_id, userId: user_id });
}

export async function createOutreachAttempt(
  contactRecord: { queue_id: number, contact_id: number, contact_phone: string }, 
  campaign_id: number,
  workspace_id: string,
  user_id: string,
) {
  return rpcCreateOutreachAttempt(db, {
    contactId: contactRecord.contact_id,
    campaignId: campaign_id,
    userId: user_id,
    workspaceId: workspace_id,
    queueId: contactRecord.queue_id,
  });
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

function buildCallRow(callData: Partial<Call>) {
  return {
    sid: callData.sid!,
    account_sid: callData.account_sid || null,
    to: callData.to || null,
    from: callData.from || null,
    status: callData.status || null,
    start_time: callData.start_time ? new Date(callData.start_time).toISOString() : null,
    end_time: callData.end_time ? new Date(callData.end_time).toISOString() : null,
    duration: callData.duration ? String(callData.duration) : null,
    price: callData.price ? String(callData.price) : null,
    direction: callData.direction || null,
    answered_by: callData.answered_by || null,
    api_version: callData.api_version || null,
    forwarded_from: callData.forwarded_from || null,
    group_sid: callData.group_sid || null,
    caller_name: callData.caller_name || null,
    uri: callData.uri || null,
    campaign_id: callData.campaign_id || null,
    contact_id: callData.contact_id || null,
    outreach_attempt_id: callData.outreach_attempt_id || null,
    conference_id: callData.conference_id || null,
    phone_number_sid: callData.phone_number_sid || null,
    parent_call_sid: callData.parent_call_sid || null,
    date_updated: callData.date_updated
      ? new Date(callData.date_updated).toISOString()
      : null,
  };
}

export async function saveCallToDatabase(
  workspaceId: string,
  callData: Partial<Call>,
  options?: { tdb?: TenantDb },
) {
  if (!callData.sid) {
    logger.error("Cannot save call without sid");
    return;
  }

  const tdb = options?.tdb ?? createTenantDb(workspaceId);
  const row = buildCallRow(callData);

  try {
    const existing = await tdb.call.findFirst({
      where: eq(callTable.sid, callData.sid),
    });
    if (existing) {
      await tdb.call.update({
        set: row,
        where: eq(callTable.sid, callData.sid),
      });
      return;
    }
    await tdb.call.insert({
      ...row,
      date_created: new Date().toISOString(),
      is_last: false,
    });
  } catch (error) {
    logger.error("Error saving the call to the database:", error);
  }
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
