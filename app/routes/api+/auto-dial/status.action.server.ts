import {
  billingUnitsFromCallDurationSeconds,
  persistCallStatusFromParams,
  twilioParamsToUnderCase,
} from "@/lib/twilio-call-status.server";
import { buildProviderStatusQueueUpdate } from "@/lib/queue-status";
import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";
import { createWorkspaceTwilioInstance } from "@/lib/database.server";
import { data as routeData } from "react-router";
import { env } from "@/lib/env.server";
import { getServiceSupabase } from "@/lib/supabase.server";
import { insertTransactionHistoryIdempotent } from "@/lib/transaction-history.server";
import { logger } from "@/lib/logger.server";
import { OutreachAttempt } from "@/lib/types";
import { Tables } from "@/lib/database.types";
import type Twilio from "twilio";
import { validateTwilioWebhookForCallSid } from "@/lib/twilio-webhook.server";
import { callKey } from "@/lib/billing-keys";
import { debitAmountFromCredits } from "@/lib/pricing";
import type { ActionFunctionArgs } from "react-router";
import type { RealtimeChannel } from "@supabase/supabase-js";

type TwilioClient = Twilio.Twilio;

const getSupabase = () => getServiceSupabase();

const updateCall = async (sid: string, update: Partial<Tables<"call">>) => {
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("call")
      .update(update)
      .eq("sid", sid)
      .select()
      .single();
    if (error) throw error;
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
  update: Partial<OutreachAttempt>,
) => {
  const supabase = getSupabase();
  try {
    if (update.disposition) {
      const { data: current, error: currentError } = await supabase
        .from("outreach_attempt")
        .select("disposition, contact_id")
        .eq("id", Number(id))
        .single();
      if (!currentError && current?.disposition) {
        const c = String(current.disposition).toLowerCase();
        const n = String(update.disposition).toLowerCase();
        if (!canTransitionOutreachDisposition(c, n)) {
          logger.debug("Skipping outreach disposition transition", {
            id,
            current: c,
            next: n,
          });
          return current as Pick<Tables<"outreach_attempt">, "disposition" | "contact_id">;
        }
      }
    }

    const { data, error } = await supabase
      .from("outreach_attempt")
      .update(update)
      .eq("id", Number(id))
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (error: unknown) {
    logger.error("Error updating outreach attempt:", error);
    return new Response(
      `Error updating outreach attempt: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
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
    const dbCall = await updateCall(callSid, {
      end_time: new Date(timestamp).toISOString(),
      duration: Math.max(Number(underCase.duration), Number(underCase.call_duration)).toString(),
      status: (typeof underCase.call_status === "string" ? underCase.call_status : "")?.toLowerCase() as Tables<"call">["status"]
    });
    if (!dbCall.outreach_attempt_id) {
      throw new Error("Missing outreach_attempt_id for participant leave");
    }
    const { data: outreachStatus, error: outreachError } = await supabase
      .from('outreach_attempt')
      .select('*')
      .eq('id', dbCall.outreach_attempt_id)
      .single();
    if (outreachError) {
      logger.error("Error fetching outreach status", outreachError);
      throw outreachError;
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
    if (!dbCall.conference_id) {
      await updateCall(
        requireValue(typeof underCase.call_sid === "string" ? underCase.call_sid : null, "CallSid"),
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

    const { data: dbCall, error: callError } = await supabase
      .from("call")
      .select()
      .eq("sid", callSidValue)
      .single();
    if (callError) {
      throw new Error("Failed to fetch call data: " + callError.message);
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
