import { data as routeData } from "react-router";
import { checkSchedule } from "@/lib/database/campaign.server";
import { createWorkspaceTwilioInstance } from "@/lib/database/workspace.server";
import { CallInstance } from "twilio/lib/rest/api/v2010/account/call";
import { eq } from "drizzle-orm";
import { call as callTable } from "@/db/schema";
import { insertCallForWorkspace, updateCallBySid } from "@/lib/telephony-db.server";
import { getWorkspaceCreditsBalance } from "@/lib/workspace-credits.server";
import { hasInsufficientCreditsForOutbound } from "../../shared/credit-floor";
import { createTenantDb } from "@/server/tenant-db";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { withTwilioRetry } from "@/lib/twilio-client.server";
import { findCampaignInWorkspace } from "@/lib/campaign-ivr.server";
import type TwilioSDK from "twilio";

type TwilioClient = TwilioSDK.Twilio;

export type StartAutoDialConferenceInput = {
  userId: string;
  workspaceId: string;
  campaignId: number;
  callerId: string;
  selectedDevice: string;
};

export type StartAutoDialConferenceResult =
  | { ok: true; conferenceName: string }
  | { ok: false; status: number; error: string; creditsError?: boolean };

function buildPendingCallSid(): string {
  const randomSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;

  return `pending-auto-dial-${randomSuffix}`;
}

export async function startAutoDialConference(
  input: StartAutoDialConferenceInput,
): Promise<StartAutoDialConferenceResult> {
  const { userId, workspaceId, campaignId, callerId, selectedDevice } = input;

  const credits = await getWorkspaceCreditsBalance(workspaceId);
  if (credits === null) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  if (hasInsufficientCreditsForOutbound(credits)) {
    return {
      ok: false,
      status: 402,
      error: "Insufficient credits",
      creditsError: true,
    };
  }

  const campaign = await findCampaignInWorkspace(workspaceId, campaignId);
  if (!campaign) {
    return { ok: false, status: 404, error: "Campaign not found" };
  }
  if (!checkSchedule(campaign)) {
    return { ok: false, status: 400, error: "Campaign is not currently active" };
  }

  const twilio = await createWorkspaceTwilioInstance({ workspace_id: workspaceId });
  const conferenceName = `${userId}~${
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
  }`;
  const targetDevice =
    selectedDevice && selectedDevice !== "computer"
      ? selectedDevice
      : `client:${userId}`;
  const pendingCallSid = buildPendingCallSid();

  const pendingRow = await insertCallForWorkspace(workspaceId, {
    sid: pendingCallSid,
    from: callerId,
    to: targetDevice,
    status: "initiated",
    campaign_id: campaignId,
    conference_id: conferenceName,
    direction: "outbound-api",
  });

  if (!pendingRow) {
    logger.error("Error creating pending auto-dial call record", {
      workspaceId,
      conferenceName,
    });
    return { ok: false, status: 500, error: "Unable to start call" };
  }

  try {
    const call: CallInstance = await withTwilioRetry(
      () =>
        twilio.calls.create({
          to: targetDevice,
          from: callerId,
          url: `${env.BASE_URL()}/api/auto-dial/${conferenceName}`,
        }),
      { workspaceId, operation: "calls.create" },
    );

    const savedCall = await insertCallForWorkspace(workspaceId, {
      sid: call.sid,
      date_updated: call.dateUpdated?.toISOString() ?? null,
      parent_call_sid: call.parentCallSid ?? null,
      account_sid: call.accountSid ?? null,
      from: call.from ?? null,
      to: call.to ?? null,
      phone_number_sid: call.phoneNumberSid ?? null,
      status: call.status ?? null,
      start_time: call.startTime?.toISOString() ?? null,
      end_time: call.endTime?.toISOString() ?? null,
      duration: call.duration ?? null,
      price: call.price ?? null,
      direction: call.direction ?? null,
      answered_by:
        (call.answeredBy as "human" | "machine" | "unknown" | null) ?? null,
      api_version: call.apiVersion ?? null,
      forwarded_from: call.forwardedFrom ?? null,
      group_sid: call.groupSid ?? null,
      caller_name: call.callerName ?? null,
      uri: call.uri ?? null,
      campaign_id: campaignId,
      conference_id: conferenceName,
    });

    if (!savedCall) {
      logger.error("Error saving the call to the database:", { callSid: call.sid });

      try {
        await withTwilioRetry(
          () => twilio.calls(call.sid).update({ status: "canceled" }),
          { workspaceId, operation: "calls.update" },
        );
      } catch (cancelError) {
        logger.error("Failed to cancel Twilio call after DB upsert failure", {
          callSid: call.sid,
          cancelError,
        });
      }

      await updateCallBySid(workspaceId, pendingCallSid, {
        status: "failed",
        date_updated: new Date().toISOString(),
      });

      return { ok: false, status: 500, error: "Unable to persist call state" };
    }

    const tdb = createTenantDb(workspaceId);
    try {
      await tdb.call.delete({ where: eq(callTable.sid, pendingCallSid) });
    } catch (pendingDeleteError) {
      logger.warn("Failed to remove pending auto-dial call record", {
        pendingCallSid,
        error: pendingDeleteError,
      });
    }

    return { ok: true, conferenceName };
  } catch (error) {
    await updateCallBySid(workspaceId, pendingCallSid, {
      status: "failed",
      date_updated: new Date().toISOString(),
    });

    logger.error("Error starting conference:", error);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Unable to start call",
    };
  }
}

export type AutoDialCreditsErrorResponse = ReturnType<typeof routeData>;

export function autoDialCreditsErrorResponse(): AutoDialCreditsErrorResponse {
  return routeData({ creditsError: true }, { status: 402 });
}
