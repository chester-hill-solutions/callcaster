import { LoaderFunctionArgs } from "@remix-run/node";
import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";
import { isEmail, isPhoneNumber } from "~/lib/utils";
import { sendWebhookNotification } from "~/lib/WorkspaceSettingUtils/WorkspaceSettingUtils";

export const action = async ({ request }: LoaderFunctionArgs) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
  const formData = await request.formData();
  const data = Object.fromEntries(formData);
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
      data: {
        inbound_action: string | null;
        inbound_audio: string | null;
        type: string | null;
        workspace: string | null;
        twilio_data: {
          account_sid: string;
          auth_token: string;
        } | null;
      } | null;
      error: Error | null;
    };
  if (!number) {
    throw { status: 404, statusText: "Not Found" };
  }
  if (numberError) {
    console.error("Error on function getWorkspacePhoneNumbers", numberError);
    throw { status: 500, statusText: "Internal Server Error" };
  }

  const { data: voicemail, error: voicemailError } = number?.inbound_audio
    ? await supabase.storage
      .from(`workspaceAudio`)
      .createSignedUrl(`${number.workspace}/${number.inbound_audio}`, 3600)
    : { data: null, error: null };
  
  // Insert call record
  const { data: call, error: callError } = await supabase
    .from("call")
    .upsert({
      sid: data.CallSid,
      account_sid: data.AccountSid,
      to: data.To,
      from: data.From,
      status: "completed",
      start_time: new Date(),
      direction: data.Direction,
      api_version: data.ApiVersion,
      workspace: number.workspace,
      duration: Math.max(Number(data.Duration), Number(data.CallDuration)),
    })
    .select()
    .single();

  if (callError) {
    console.error("Error on function insert call", callError);
    throw { status: 500, statusText: "Internal Server Error" };
  }

  // Send webhook notification for inbound call
  const callWebhook = number.webhook.map((webhook: any) => webhook.events.filter((event: any) => event.category === "inbound_call")).flat()
  if (callWebhook.length > 0) {
    await sendWebhookNotification({
      eventCategory: "inbound_call",
      eventType: "INSERT",
      workspaceId: number.workspace || "",
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
