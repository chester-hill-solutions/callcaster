import { createSupabaseServerClient } from "~/lib/supabase.server";
import { redirect, json } from "@remix-run/node";
import twilio from "twilio";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";

export const loader = async ({ request }) => {
  const { supabaseClient: supabase, headers, serverSession } = await getSupabaseServerClientWithSession(request);
  let url = new URL(request.url);
  let identity = url.searchParams.get('id');
  let workspace = url.searchParams.get('workspace');
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
  console.log(token)
  return json({ token: token.toJwt() });
};

export const generateToken = ({ twilioAccountSid, twilioApiKey, twilioApiSecret, identity }) => {
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
  return token.toJwt();
}