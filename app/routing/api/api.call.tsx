import Twilio from 'twilio';
import type { ActionFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { isPhoneNumber, normalizePhoneNumber } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const toNumber = (formData.get("To") as string) ?? "";
  const workspaceId = formData.get("workspace_id") as string | null;
  const clientIdentity = formData.get("client_identity") as string | null;
  const baseUrl = env.BASE_URL();
  const twiml = new Twilio.twiml.VoiceResponse();

  // Handset outbound: validate session and use workspace handset number as callerId
  if (
    workspaceId &&
    clientIdentity &&
    toNumber &&
    isPhoneNumber(toNumber)
  ) {
    const supabase = createClient<Database>(
      env.SUPABASE_URL(),
      env.SUPABASE_SERVICE_KEY()
    );
    const now = new Date().toISOString();
    const { data: session } = await supabase
      .from("handset_session")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("client_identity", clientIdentity)
      .eq("status", "active")
      .gt("expires_at", now)
      .maybeSingle();

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

    const { data: handset } = await supabase
      .from("workspace_number")
      .select("phone_number")
      .eq("workspace", workspaceId)
      .eq("handset_enabled", true)
      .limit(1)
      .maybeSingle();

    const callerId =
      handset?.phone_number ??
      (
        await supabase
          .from("workspace_number")
          .select("phone_number")
          .eq("workspace", workspaceId)
          .limit(1)
          .maybeSingle()
      ).data?.phone_number;

    if (!callerId || !isPhoneNumber(callerId)) {
      twiml.say("No caller ID is configured for this workspace.");
      return new Response(twiml.toString(), {
        headers: { "Content-Type": "text/xml" },
      });
    }

    const normalizedTo = normalizePhoneNumber(toNumber);
    const dial = twiml.dial({
      callerId,
      record: "record-from-answer",
      recordingStatusCallback: `${baseUrl}/api/recording`,
      recordingStatusCallbackEvent: ["completed"],
      transcribe: true,
      transcribeCallback: `${baseUrl}/api/transcribe`,
    } as Record<string, unknown>);
    dial.number({
      machineDetection: "Enable",
      amdStatusCallback: `${baseUrl}/api/dial/status`,
      statusCallback: `${baseUrl}/api/call-status/`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    }, normalizedTo);
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
      transcribe: true,
      transcribeCallback: `${baseUrl}/api/transcribe`,
    } as Record<string, unknown>);
    dial.number(toNumber);
  } else {
    twiml.say("The provided phone number is invalid.");
  }

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
};

function isAValidPhoneNumber(number: string): boolean {
  return /^[\d+\-() ]+$/.test(number);
}
