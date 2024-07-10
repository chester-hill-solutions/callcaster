import { createSupabaseServerClient } from "~/lib/supabase.server";
import { redirect, json } from "@remix-run/node";
import twilio from "twilio";

export const loader = async ({ request }) => {
  let url = new URL(request.url);
  let identity = url.searchParams.get('id');
  let workspace = url.searchParams.get('workspace');
  const { supabaseClient: supabase, headers } =
    createSupabaseServerClient(request);
  const baseUrl = process.env.BASE_URL;
  const { data, error } = await supabase.from('workspace').select('twilio_data, key, token').eq('id', workspace).single();
  const twilioAccountSid = data.twilio_data.sid;
  const twilioApiKey = data.key;
  const twilioApiSecret = data.token;

  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_APP_SID,
    incomingAllow: true,
  });
  const token = new twilio.jwt.AccessToken(
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    { identity }
  );
  token.addGrant(voiceGrant);
  return json({ token: token.toJwt() });
};
