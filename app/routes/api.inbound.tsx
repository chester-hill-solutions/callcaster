import { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { isEmail, isPhoneNumber } from "@/lib/utils";
import { sendWebhookNotification } from "@/lib/workspace-settings/WorkspaceSettingUtils";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import type { TwilioInboundCallWebhook, WebhookEvent } from "@/lib/twilio.types";
import type { Database } from "@/lib/database.types";

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
      ...workspace!inner(id, twilio_data, webhook(*))`,
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

  const workspaceId =
    (number.workspace && typeof number.workspace === "object" && "id" in number.workspace
      ? number.workspace.id
      : typeof number.workspace === "string"
        ? number.workspace
        : null) ?? null;
  let voicemail: { signedUrl: string } | null = null;
  if (number?.inbound_audio && workspaceId) {
    // Prefer treating inbound_audio as storage path (filename); fallback to resolving by id via list
    const { data: signedByPath } = await supabase.storage
      .from("workspaceAudio")
      .createSignedUrl(`${workspaceId}/${number.inbound_audio}`, 3600);
    if (signedByPath?.signedUrl) {
      voicemail = { signedUrl: signedByPath.signedUrl };
    } else {
      const { data: files } = await supabase.storage
        .from("workspaceAudio")
        .list(workspaceId);
      const file = files?.find(
        (f) => String(f.id) === String(number.inbound_audio) || f.name === number.inbound_audio
      );
      if (file) {
        const { data: signed } = await supabase.storage
          .from("workspaceAudio")
          .createSignedUrl(`${workspaceId}/${file.name}`, 3600);
        if (signed?.signedUrl) voicemail = { signedUrl: signed.signedUrl };
      }
    }
  }
  
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

  if (typeof number?.inbound_action === "string" && isPhoneNumber(number.inbound_action)) {
    twiml.pause({ length: 1 });
    twiml.dial(number.inbound_action || '');
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } else if (typeof number?.inbound_action === "string" && isEmail(number.inbound_action)) {
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
