import { json } from "@remix-run/node";
import twilio from "twilio";
import { getSupabaseServerClientWithSession } from "../lib/supabase.server";
import type { LoaderFunctionArgs } from "@remix-run/node";

interface GenerateTokenParams {
  twilioAccountSid: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  identity: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase } = await getSupabaseServerClientWithSession(request);
  let url = new URL(request.url);
  let identity = url.searchParams.get('id') ?? '';
  let workspace = url.searchParams.get('workspace') ?? '';
  // const baseUrl = process.env['BASE_URL'];
  const { data, error } = await supabase
    .from('workspace')
    .select('twilio_data, key, token')
    .eq('id', workspace)
    .single();

  if (error || !data) {
    return json({ error: 'workspace not found' }, { status: 404 });
  }

  const twilioData = (data.twilio_data ?? {}) as Record<string, unknown>;
  const twilioAccountSid = typeof twilioData['sid'] === 'string' ? (twilioData['sid'] as string) : '';
  const twilioApiKey = (data.key ?? '') as string;
  const twilioApiSecret = (data.token ?? '') as string;

  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env['TWILIO_APP_SID'] ?? '',
    incomingAllow: true,
  });
  const token = new twilio.jwt.AccessToken(
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    { identity: identity ?? '' }
  );
  token.addGrant(voiceGrant);
  console.log(token)
  return json({ token: token.toJwt() });
};

export const generateToken = ({ twilioAccountSid, twilioApiKey, twilioApiSecret, identity }: GenerateTokenParams) => {
  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env['TWILIO_APP_SID'] ?? '',
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