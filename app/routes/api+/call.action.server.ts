import { env } from "@/lib/env.server";
import { getHandsetNumberForWorkspace } from "@/lib/database/workspace.server";
import { findActiveHandsetSession } from "@/lib/handset/handset-session.server";
import { appendLiveTranscriptionStreamTwiml } from "@/lib/media-stream-twiml.server";
import { isPhoneNumber, normalizePhoneNumber } from "@/lib/utils";
import { logger } from "@/lib/logger.server";
import { requireTwilioSignature } from "@/lib/twilio-webhook.server";
import { insertCallForWorkspace } from "@/lib/telephony-db.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";
import { defineAction } from "@/lib/handler.server";
import Twilio from "twilio";
import type { ActionFunctionArgs } from "react-router";

function isAValidPhoneNumber(number: string): boolean {
  return /^[\d+\-() ]+$/.test(number);
}

type CallAuth = {
  toNumber: string;
  workspaceId: string | null;
  clientIdentity: string | null;
  callSid: string;
};

export const action = defineAction({
  auth: async ({ request }: ActionFunctionArgs): Promise<CallAuth | Response> => {
    const formData = await request.clone().formData();
    const toNumber = (formData.get("To") as string) ?? "";
    const workspaceId = formData.get("workspace_id") as string | null;
    const clientIdentity = formData.get("client_identity") as string | null;
    const callSid = String(formData.get("CallSid") ?? "");

    const forbidden = await requireTwilioSignature(
      request,
      workspaceId ? { workspaceId } : {},
    );
    if (forbidden) return forbidden;

    return { toNumber, workspaceId, clientIdentity, callSid };
  },
  sideEffects: ["twilio", "db-write"],
  handler: async ({ auth }) => {
    const { toNumber, workspaceId, clientIdentity, callSid } = auth;
    const baseUrl = env.BASE_URL();
    const twiml = new Twilio.twiml.VoiceResponse();

  // Handset outbound: validate session and use workspace handset number as callerId
  if (workspaceId && clientIdentity && toNumber && isPhoneNumber(toNumber)) {
    const session = await findActiveHandsetSession({ workspaceId, clientIdentity });

    if (!session) {
      logger.warn("Handset outbound: no active session", {
        workspaceId,
        clientIdentity: clientIdentity.slice(0, 12) + "...",
      });
      twiml.say("Your handset session has expired. Please refresh the page.");
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const { data: handset } = await getHandsetNumberForWorkspace({ workspaceId });
    const callerId = handset?.phone_number;

    if (!callerId || !isPhoneNumber(callerId)) {
      twiml.say("No caller ID is configured for this workspace.");
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const normalizedTo = normalizePhoneNumber(toNumber);

    if (callSid) {
      await insertCallForWorkspace(workspaceId, {
        sid: callSid,
        workspace: workspaceId,
        user_id: session.user_id,
        to: normalizedTo,
        from: callerId,
        status: "initiated",
        direction: "outbound",
        is_last: false,
      });
    }

    const workspace = await getWorkspaceById(workspaceId);
    appendLiveTranscriptionStreamTwiml({
      twiml,
      featureFlags: workspace?.feature_flags as Record<string, unknown> | undefined,
      params: {
        workspaceId,
        userId: session.user_id,
        direction: "outbound",
        callSid: callSid || null,
        streamName: callSid ? `call-${callSid}` : undefined,
      },
    });

    const dial = twiml.dial({
      callerId,
      record: "record-from-answer",
      recordingStatusCallback: `${baseUrl}/api/recording`,
      recordingStatusCallbackEvent: ["completed"],
    } as Record<string, unknown>);
    dial.number(
      {
        machineDetection: "Enable",
        amdStatusCallback: `${baseUrl}/api/dial/status`,
        statusCallback: `${baseUrl}/api/call-status/`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      },
      normalizedTo,
    );
    return new Response(twiml.toString(), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Default: dial To with app-level caller ID
  if (isAValidPhoneNumber(toNumber)) {
    const dial = twiml.dial({
      callerId: env.TWILIO_PHONE_NUMBER(),
      record: "record-from-answer",
      recordingStatusCallback: `${baseUrl}/api/recording`,
      recordingStatusCallbackEvent: ["completed"],
    } as Record<string, unknown>);
    dial.number(toNumber);
  } else {
    twiml.say("The provided phone number is invalid.");
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
  },
});
