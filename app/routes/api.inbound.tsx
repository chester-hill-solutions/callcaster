import { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { isEmail, isPhoneNumber } from "~/lib/utils";
import { sendWebhookNotification } from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";
import { env } from "~/lib/env.server";
import { logger } from "~/lib/logger.server";
import type { TwilioInboundCallWebhook, WebhookEvent } from "~/lib/twilio.types";
import type { Database } from "~/lib/database.types";

interface WorkspaceNumberData {
  inbound_action: string | null;
  inbound_audio: string | null;
  type: string | null;
  workspace: {
    id: string;
    twilio_data: {
      account_sid: string;
      auth_token: string;
    } | null;
    webhook: Array<{
      events: WebhookEvent[];
    }>;
  } | null;
}

export const action = async ({ request }: LoaderFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const supabase = createClient<Database>(
    env.SUPABASE_URL(),
    env.SUPABASE_SERVICE_KEY(),
  );
  const formData = await request.formData();
  const data = Object.fromEntries(formData) as Partial<TwilioInboundCallWebhook>;
  
  if (!data.Called) {
    throw { status: 400, statusText: "Missing Called parameter" };
  }
  
  const { data: number, error: numberError } = await supabase
    .from("workspace_number")
    .select(
      `
      inbound_action,
      inbound_audio,
      type,
      workspace,
      ...workspace!inner(twilio_data, webhook(*))`,
    )
    .eq("phone_number", data.Called)
    .single() as {
      data: WorkspaceNumberData | null;
      error: Error | null;
    };
  if (!number) {
    throw { status: 404, statusText: "Not Found" };
  }
  if (numberError) {
    logger.error("Error on function getWorkspacePhoneNumbers", numberError);
    throw { status: 500, statusText: "Internal Server Error" };
  }

  const { data: voicemail, error: voicemailError } = number?.inbound_audio
    ? await supabase.storage
      .from(`workspaceAudio`)
      .createSignedUrl(`${number.workspace}/${number.inbound_audio}`, 3600)
    : { data: null, error: null };
  
  // Insert call record
  if (!data.CallSid || typeof data.CallSid !== 'string') {
    throw { status: 400, statusText: "Missing CallSid" };
  }
  
  const { data: call, error: callError } = await supabase
    .from("call")
    .upsert({
      sid: data.CallSid,
      account_sid: data.AccountSid || null,
      to: data.To || null,
      from: data.From || null,
      status: "completed" as const,
      start_time: new Date().toISOString(),
      direction: data.Direction || null,
      api_version: data.ApiVersion || null,
      workspace: number.workspace?.id || null,
      duration: String(Math.max(Number(data.Duration || 0), Number(data.CallDuration || 0))),
    } as Database['public']['Tables']['call']['Insert'])
    .select()
    .single();

  if (callError) {
    logger.error("Error on function insert call", callError);
    throw { status: 500, statusText: "Internal Server Error" };
  }

  // Send webhook notification for inbound call
  const callWebhook = number.workspace?.webhook
    ?.flatMap((webhook) => 
      webhook.events.filter((event) => event.category === "inbound_call")
    ) || [];
  if (callWebhook.length > 0) {
    await sendWebhookNotification({
      eventCategory: "inbound_call",
      eventType: "INSERT",
      workspaceId: number.workspace?.id || "",
      payload: {
        call_sid: call.sid,
        from: call.from,
        to: call.to,
        status: call.status,
        direction: call.direction,
        timestamp: call.start_time,
      },
      supabaseClient: supabase,
    });
  }

  if (isPhoneNumber(number?.inbound_action)) {
    twiml.pause({ length: 1 });
    twiml.dial(number.inbound_action || '');
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } else if (isEmail(number?.inbound_action)) {
    const phoneNumber = data.Called;
    if (voicemail?.signedUrl) {
      twiml.play(voicemail.signedUrl);
    } else {
      twiml.say(
        `Thank you for calling ${phoneNumber}, we're unable to answer your call at the moment. Please leave us a message and we'll get back to you as soon as possible.`,
      );
    }
    twiml.pause({ length: 1 });
    twiml.record({
      transcribe: true,
      timeout: 10,
      playBeep: true,
      recordingStatusCallback: "/api/email-vm",
    });
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } else {
    const phoneNumber = data.Called;
    twiml.say(
      `Thank you for calling ${phoneNumber}, we're unable to answer your call at the moment. Please try again later.`,
    );
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
};
