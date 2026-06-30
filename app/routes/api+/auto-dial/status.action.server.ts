import {
  billingUnitsFromCallDurationSeconds,
  persistCallStatusFromParams,
  twilioParamsToUnderCase,
} from "@/lib/twilio-call-status.server";
import { buildProviderStatusQueueUpdate } from "@/lib/queue-status";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { getServiceSupabase } from "@/lib/supabase.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { logger } from "@/lib/logger.server";
import { OutreachAttempt } from "@/lib/types";
import { Tables } from "@/lib/database.types";
import type Twilio from "twilio";
import {
  findCallBySid,
  findOutreachAttemptById,
  updateCallBySid,
  updateOutreachAttemptForWorkspace,
} from "@/lib/telephony-db.server";
import { callKey } from "@/lib/billing-keys";
import { debitAmountFromCredits } from "@/lib/pricing";
import type { ActionFunctionArgs } from "react-router";
import type { RealtimeChannel } from "@supabase/supabase-js";

type TwilioClient = Twilio.Twilio;

const getSupabase = () => getServiceSupabase();

const updateCall = async (sid: string, workspaceId: string, update: Partial<Tables<"call">>) => {
  try {
    const data = await updateCallBySid(workspaceId, sid, update);
    if (!data) {
      throw new Error(`Call ${sid} not found`);
    }
    return data;
  } catch (error) {
    logger.error("Error updating call:", error);
    throw error;
  }
};

const requireValue = (
  value: string | null | undefined,
  fieldName: string,
): string => {
  if (!value) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return value;
};

type OutreachAttemptUpdateResult =
  | Pick<Tables<"outreach_attempt">, "disposition" | "contact_id">
  | Tables<"outreach_attempt">
  | Response;

function resolveOutreachUpdate(
  result: OutreachAttemptUpdateResult,
): Pick<Tables<"outreach_attempt">, "disposition" | "contact_id"> | Tables<"outreach_attempt"> | null {
  if (result instanceof Response) {
    return null;
  }
  return result;
}

export const updateOutreachAttempt = async (
  id: string,
  workspaceId: string,
  update: Partial<OutreachAttempt>,
) => {
  return updateOutreachAttemptForWorkspace(workspaceId, id, update);
};

const updateCampaignQueue = async (
  contactId: number,
  campaignId: number,
  update: Partial<Tables<"campaign_queue">>,
) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("campaign_queue")
      .update(update)
      .eq("contact_id", contactId)
      .eq("campaign_id", campaignId)
      .select();
    if (error) throw error;
    return data;
  } catch (error) {
    logger.error("Error updating campaign queue:", error);
    throw error;
  }
};

const triggerAutoDialer = async (callData: Tables<"call">) => {
  try {
    const response = await fetch(
      `${env.BASE_URL()}/api/auto-dial/dialer`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: callData.conference_id,
          campaign_id: callData.campaign_id,
          workspace_id: callData.workspace,
          conference_id: callData.conference_id,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    logger.error("Error triggering auto dialer:", error);
    throw error;
  }
};

const handleCallStatus = async (
  parsedBody: { [x: string]: string },
  dbCall: Tables<"call">,
  twilio: TwilioClient,
  realtime: RealtimeChannel,
  status: Tables<"call">["status"],
  duration: number
) => {
  const supabase = getSupabase();
  try {
    const callSid = requireValue(parsedBody.CallSid, "CallSid");
    const callUpdate = await persistCallStatusFromParams({
      supabase,
      params: parsedBody,
      disposition: status?.toLowerCase(),
      outreachAttemptId: dbCall.outreach_attempt_id
        ? Number(dbCall.outreach_attempt_id)
        : null,
      selectResult: true,
    });
    if (!callUpdate) {
      throw new Error("persistCallStatusFromParams returned no call row");
    }
    if (!callUpdate.outreach_attempt_id) {
      throw new Error("Missing outreach_attempt_id for auto-dial status update");
    }
    const outreachStatus = resolveOutreachUpdate(
      await updateOutreachAttempt(
        String(callUpdate.outreach_attempt_id),
        requireValue(callUpdate.workspace, "workspace"),
        { disposition: status?.toLowerCase() as Tables<"outreach_attempt">["disposition"] },
      ),
    );
    if (!outreachStatus) {
      return;
    }
    await updateTransaction(callUpdate, duration);

    const { error } = await supabase.rpc("dequeue_contact", {
      passed_contact_id: outreachStatus.contact_id,
      group_on_household: true,
      dequeued_by_id: callUpdate.conference_id ?? "",
      dequeued_reason_text: `Call ${status?.toLowerCase()}`
    });
    if (error) {
      logger.error("Error dequeing contact", error);
      throw error;
    }
    realtime.send({
      type: "broadcast",
      event: "message",
      payload: { contact_id: outreachStatus.contact_id, status },
    });
    const conferences = await twilio.conferences.list({
      friendlyName: callUpdate.conference_id ?? "",
      status: "in-progress",
    });
    if (conferences.length && status !== "completed") {
      await triggerAutoDialer(dbCall);
    }
  } catch (error) {
    logger.error("Error in handleCallStatus:", error);
    throw error;
  }
};

const updateTransaction = async (call: Tables<"call">, duration: number) => {
  const supabase = getSupabase();
  if (!call.workspace) {
    logger.error("Skipping transaction update because call workspace is missing", {
      callSid: call.sid,
    });
    return null;
  }
  const billingUnits = billingUnitsFromCallDurationSeconds(duration, "staffed");
  await insertTransactionHistoryIdempotent({
    supabase,
    workspaceId: call.workspace,
    type: "DEBIT",
    amount: debitAmountFromCredits(billingUnits),
    note: `Call ${call.sid}, Contact ${call.contact_id}, Outreach Attempt ${call.outreach_attempt_id}`,
    idempotencyKey: callKey(call.sid, "staffed"),
    callSid: call.sid,
  });
  return null;
}

const handleParticipantLeave = async (
  parsedBody: { [x: string]: string },
  twilio: TwilioClient,
  realtime: RealtimeChannel,
) => {
  const supabase = getSupabase();
  const underCase = twilioParamsToUnderCase(parsedBody);

  try {
    const callSid = requireValue(typeof underCase.call_sid === "string" ? underCase.call_sid : null, "CallSid");
    const timestamp = requireValue(typeof underCase.timestamp === "string" ? underCase.timestamp : null, "Timestamp");
    const existingCall = await findCallBySid(callSid);
    if (!existingCall?.workspace) {
      throw new Error("Call not found for participant leave");
    }
    const dbCall = await updateCall(callSid, existingCall.workspace, {
      end_time: new Date(timestamp).toISOString(),
      duration: Math.max(Number(underCase.duration), Number(underCase.call_duration)).toString(),
      status: (typeof underCase.call_status === "string" ? underCase.call_status : "")?.toLowerCase() as Tables<"call">["status"]
    });
    if (!dbCall.outreach_attempt_id) {
      throw new Error("Missing outreach_attempt_id for participant leave");
    }
    const outreachStatus = await findOutreachAttemptById(
      existingCall.workspace,
      dbCall.outreach_attempt_id,
    );
    if (!outreachStatus) {
      throw new Error("Outreach attempt not found for participant leave");
    }

    realtime.send({
      type: "broadcast",
      event: "message",
      payload: {
        contact_id: outreachStatus.contact_id,
        status: "completed",
      },
    });
    const conferences = await twilio.conferences.list({
      friendlyName: typeof underCase.friendly_name === "string" ? underCase.friendly_name : (typeof underCase.conference_sid === "string" ? underCase.conference_sid : ""),
      status: "in-progress",
    });
    await Promise.all(
      conferences.map(({ sid }: { sid: string }) =>
        twilio.conferences(sid).update({ status: "completed" }),
      ),
    );
  } catch (error) {
    logger.error("Error in handleParticipantLeave:", error);
    throw error;
  }
};

const handleParticipantJoin = async (
  parsedBody: { [x: string]: string },
  dbCall: Tables<"call">,
  realtime: RealtimeChannel,
) => {
  const underCase = twilioParamsToUnderCase(parsedBody);
  try {
    const workspaceId = requireValue(dbCall.workspace, "workspace");
    if (!dbCall.conference_id) {
      await updateCall(
        requireValue(typeof underCase.call_sid === "string" ? underCase.call_sid : null, "CallSid"),
        workspaceId,
        {
          conference_id: requireValue(typeof underCase.conference_sid === "string" ? underCase.conference_sid : null, "ConferenceSid"),
          start_time: new Date(requireValue(typeof underCase.timestamp === "string" ? underCase.timestamp : null, "Timestamp")).toISOString(),
        },
      );
    }
    if (dbCall.outreach_attempt_id) {
      if (!dbCall.campaign_id) {
        throw new Error("Missing campaign_id for participant join");
      }
      const outreachStatus = resolveOutreachUpdate(
        await updateOutreachAttempt(
          `${dbCall.outreach_attempt_id}`,
          workspaceId,
          { disposition: "in-progress", answered_at: new Date().toISOString() },
        ),
      );
      if (!outreachStatus) {
        return;
      }
      await updateCampaignQueue(outreachStatus.contact_id, dbCall.campaign_id, {
        ...buildProviderStatusQueueUpdate(
          (typeof underCase.friendly_name === "string" ? underCase.friendly_name : null) ??
            (typeof underCase.conference_sid === "string" ? underCase.conference_sid : null) ??
            "in-progress",
          { includeNormalizedFields: true },
        ),
      });

      realtime.send({
        type: "broadcast",
        event: "message",
        payload: {
          contact_id: outreachStatus.contact_id,
          status: "connected",
        },
      });
    }
  } catch (error) {
    logger.error("Error in handleParticipantJoin:", error);
    throw error;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const supabase = getSupabase();

  let realtime;
  try {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const parsedBody = params;
    const underCase = twilioParamsToUnderCase(params);

    const callSidValue =
      typeof underCase.call_sid === "string" ? underCase.call_sid : null;
    if (!callSidValue) {
      throw new Error("Missing CallSid");
    }

    const validation = await validateTwilioWebhookForCallSid({
      request,
      supabase,
      callSid: callSidValue,
      params,
    });
    if (!validation.ok) {
      return validation.response;
    }

    const dbCall = await findCallBySid(callSidValue);
    if (!dbCall?.workspace) {
      throw new Error("Failed to fetch call data");
    }

    const twilio = await createWorkspaceTwilioInstance({ supabase: supabase,
      workspace_id: requireValue(dbCall.workspace, "workspace"),
    });
    realtime = supabase.channel(
      (typeof underCase.conference_sid === "string" ? underCase.conference_sid : null) ??
        dbCall.conference_id ??
        "default",
    );
    const callStatusValue =
      typeof underCase.call_status === "string" ? underCase.call_status : "";
    switch (callStatusValue) {
      case "failed":
      case "busy":
      case "no-answer":
      case "completed":
        await handleCallStatus(
          parsedBody,
          dbCall,
          twilio,
          realtime,
          callStatusValue?.toLowerCase() as Tables<"call">["status"],
          Math.max(
            Number(underCase.call_duration) || 0,
            Number(underCase.duration) || 0,
          )
        );
        break;
      default:
        if (
          (typeof underCase.status_callback_event === "string"
            ? underCase.status_callback_event
            : "") === "participant-leave" &&
          (typeof underCase.reason_participant_left === "string"
            ? underCase.reason_participant_left
            : "") === "participant_hung_up"
        ) {
          await handleParticipantLeave(parsedBody, twilio, realtime);
        } else if (
          (typeof underCase.status_callback_event === "string"
            ? underCase.status_callback_event
            : "") === "participant-join"
        ) {
          await handleParticipantJoin(parsedBody, dbCall, realtime);
        }
    }

    return routeData({ success: true });
  } catch (error: unknown) {
    logger.error("Error processing action:", error);
    return routeData(
      { error: "Failed to process action: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    );
  } finally {
    if (realtime) {
      supabase.removeChannel(realtime);
    }
  }
};
