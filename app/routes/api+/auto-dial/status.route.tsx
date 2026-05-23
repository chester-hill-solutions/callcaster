// @ts-nocheck
import { data as routeData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { createClient, RealtimeChannel } from "@supabase/supabase-js";


import {
  readTwilioWorkspaceCredentials,
  resolveTwilioWebhookAuthToken,
} from "@/lib/twilio-workspace-credentials";
import { Tables } from "@/lib/database.types";
import { OutreachAttempt } from "@/lib/types";
import { Twilio } from "twilio";





import { canTransitionOutreachDisposition } from "@/lib/outreach-disposition";
import { buildProviderStatusQueueUpdate } from "@/lib/queue-status";

let cachedSupabase: ReturnType<typeof createClient> | null = null;
const getSupabase = async () => {
  if (cachedSupabase) return cachedSupabase;
  const { env } = await import("@/lib/env.server");
  cachedSupabase = createClient(env.SUPABASE_URL(), env.SUPABASE_SERVICE_KEY());
  return cachedSupabase;
};

const updateCall = async (sid: string, update: Partial<Tables<"call">>) => {
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");
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

export const updateOutreachAttempt = async (
  id: string,
  update: Partial<OutreachAttempt>,
) => {
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");
  try {
    if (update.disposition) {
      const { data: current, error: currentError } = await supabase
        .from("outreach_attempt")
        .select("disposition, contact_id")
        .eq("id", id)
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
          return current as any;
        }
      }
    }

    const { data, error } = await supabase
      .from("outreach_attempt")
      .update(update)
      .eq("id", id)
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
  contactId: string,
  campaignId: number,
  update: Partial<Tables<"campaign_queue">>,
) => {
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");
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
  const { env } = await import("@/lib/env.server");
  const { logger } = await import("@/lib/logger.server");
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
  twilio: Twilio,
  realtime: RealtimeChannel,
  status: Tables<"call">["status"],
  duration: number
) => {
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");
  try {
    const callSid = requireValue(parsedBody.CallSid, "CallSid");
    const timestamp = requireValue(parsedBody.Timestamp, "Timestamp");
    const callUpdate = await updateCall(callSid, {
      end_time: new Date(timestamp).toISOString(),
      status: status?.toLowerCase() as Tables<"call">["status"],
      duration: duration.toString()
    });
    if (!callUpdate.outreach_attempt_id) {
      throw new Error("Missing outreach_attempt_id for auto-dial status update");
    }
    const outreachStatus = await updateOutreachAttempt(
      String(callUpdate.outreach_attempt_id),
      { disposition: status?.toLowerCase() as Tables<"outreach_attempt">["disposition"] },
    );
    await updateTransaction(callUpdate, duration);

    const { error } = await supabase.rpc("dequeue_contact", {
      passed_contact_id: outreachStatus.contact_id,
      group_on_household: true,
      dequeued_by_id: callUpdate.conference_id,
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

const onePerSixty = (duration: number) => {
  return Math.floor(duration / 60) + 1;
}
const updateTransaction = async (call: Tables<"call">, duration: number) => {
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");
  const { insertTransactionHistoryIdempotent } = await import("@/lib/transaction-history.server");
  if (!call.workspace) {
    logger.error("Skipping transaction update because call workspace is missing", {
      callSid: call.sid,
    });
    return null;
  }
  const billingUnits = onePerSixty(duration);
  await insertTransactionHistoryIdempotent({
    supabase,
    workspaceId: call.workspace,
    type: "DEBIT",
    amount: -billingUnits,
    note: `Call ${call.sid}, Contact ${call.contact_id}, Outreach Attempt ${call.outreach_attempt_id}`,
    idempotencyKey: `call:${call.sid}`,
  });
  return null;
}

const handleParticipantLeave = async (
  parsedBody: { [x: string]: string },
  twilio: Twilio,
  realtime: RealtimeChannel,
) => {
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");

  try {
    const callSid = requireValue(parsedBody.CallSid, "CallSid");
    const timestamp = requireValue(parsedBody.Timestamp, "Timestamp");
    const dbCall = await updateCall(callSid, {
      end_time: new Date(timestamp).toISOString(),
      duration: Math.max(Number(parsedBody.Duration), Number(parsedBody.CallDuration)).toString(),
      status: parsedBody?.CallStatus?.toLowerCase() as Tables<"call">["status"]
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
      friendlyName: parsedBody.FriendlyName ?? parsedBody.ConferenceSid ?? "",
      status: "in-progress",
    });
    await Promise.all(
      conferences.map(({ sid }) =>
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
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");
  try {
    if (!dbCall.conference_id) {
      await updateCall(requireValue(parsedBody.CallSid, "CallSid"), {
        conference_id: requireValue(parsedBody.ConferenceSid, "ConferenceSid"),
        start_time: new Date(requireValue(parsedBody.Timestamp, "Timestamp")).toISOString(),
      });
    }
    if (dbCall.outreach_attempt_id) {
      if (!dbCall.campaign_id) {
        throw new Error("Missing campaign_id for participant join");
      }
      const outreachStatus = await updateOutreachAttempt(
        `${dbCall.outreach_attempt_id}`,
        { disposition: "in-progress", answered_at: new Date().toISOString() },
      );
      await updateCampaignQueue(outreachStatus.contact_id, dbCall.campaign_id, {
        ...buildProviderStatusQueueUpdate(
          parsedBody.FriendlyName ?? parsedBody.ConferenceSid ?? "in-progress",
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
  const supabase = await getSupabase();
  const { logger } = await import("@/lib/logger.server");
  const { validateTwilioWebhookParams } = await import("@/twilio.server");
  const { env } = await import("@/lib/env.server");
  const { createWorkspaceTwilioInstance } = await import("@/lib/database.server");


  let realtime;
  try {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries()) as Record<string, string>;
    const parsedBody = params;

    const { data: dbCall, error: callError } = await supabase
      .from("call")
      .select()
      .eq("sid", parsedBody.CallSid)
      .single();
    if (callError) {
      throw new Error("Failed to fetch call data: " + callError.message);
    }

    const { data: workspace } = await supabase.from("workspace").select("twilio_data").eq("id", dbCall.workspace).single();
    const creds = readTwilioWorkspaceCredentials(workspace?.twilio_data);
    const authToken = resolveTwilioWebhookAuthToken(creds);
    const signature = request.headers.get("x-twilio-signature");
    const url = new URL(request.url).href;
    if (!authToken || !validateTwilioWebhookParams(params, signature, url, authToken)) {
      return routeData({ error: "Invalid Twilio signature" }, { status: 403 });
    }

    const twilio = await createWorkspaceTwilioInstance({
      supabase,
      workspace_id: requireValue(dbCall.workspace, "workspace"),
    });
    realtime = supabase.channel(parsedBody.ConferenceSid ?? dbCall.conference_id ?? "default");
    switch (parsedBody.CallStatus) {
      case "failed":
      case "busy":
      case "no-answer":
      case "completed":
        await handleCallStatus(
          parsedBody,
          dbCall,
          twilio,
          realtime,
          parsedBody.CallStatus?.toLowerCase() as Tables<"call">["status"],
          Math.max(Number(parsedBody.CallDuration), Number(parsedBody.Duration))
        );
        break;
      default:
        if (
          parsedBody.StatusCallbackEvent === "participant-leave" &&
          parsedBody.ReasonParticipantLeft === "participant_hung_up"
        ) {
          await handleParticipantLeave(parsedBody, twilio, realtime);
        } else if (parsedBody.StatusCallbackEvent === "participant-join") {
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
