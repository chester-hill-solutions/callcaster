import { createClient } from "@supabase/supabase-js";
import Twilio from "twilio";

function isPhoneNumber(phone) {
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return false;
  }
  const phoneRegex = /^(\+?1?)?(\d{10}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})$/;
  return phoneRegex.test(phone);
}

function isEmail(email) {
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(email) || email.length > 254) {
    return false;
  }
  const [localPart, domain] = email.split("@");
  if (localPart.length > 64 || domain.length > 255) {
    return false;
  }
  if (!domain.includes(".")) {
    return false;
  }
  const domainParts = domain.split(".");
  if (domainParts[domainParts.length - 1].length < 2) {
    return false;
  }
  return true;
}

export const action = async ({ request, params }) => {
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
      type,
      workspace,
      ...workspace!inner(twilio_data)`,
    )
    .eq("phone_number", data.Called)
    .single();

  const { data: call, error: callError } = await supabase
    .from("call")
    .insert({
      sid: data.CallSid,
      account_sid: data.AccountSid,
      to: data.To,
      from: data.From,
      status: "completed",
      start_time: new Date(),
      direction: data.Direction,
      api_version: data.ApiVersion,
      workspace: number.workspace,
    })
    .select();
  if (isPhoneNumber(number?.inbound_action)) {
    twiml.dial(number.inbound_action);
    return new Response(twiml.toString(), {
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } else if (isEmail(number?.inbound_action)) {
    const phoneNumber = data.Called;
    twiml.say(
      `Thank you for calling ${phoneNumber}, we're unable to answer your call at the moment. Please leave us a message and we'll get back to you as soon as possible.`,
    );
    twiml.pause({ length: 1 });
    twiml.record({
      transcribe: true,
      timeout: 10,
      beep: true,
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
