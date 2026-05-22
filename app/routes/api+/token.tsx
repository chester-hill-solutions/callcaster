
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import twilio from "twilio";



interface GenerateTokenParams {
  twilioAccountSid: string;
  twilioApiKey: string;
  twilioApiSecret: string;
  identity: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {  const { logger } = await import("@/lib/logger.server");
  const { env } = await import("@/lib/env.server");
  const { getSupabaseServerClientWithSession } = await import("@/lib/supabase.server");
  const { requireWorkspaceAccess } = await import("@/lib/database.server");

  const { supabaseClient: supabase, user } = await getSupabaseServerClientWithSession(request);
  const url = new URL(request.url);
  const workspace = url.searchParams.get('workspace') ?? '';

  if (!workspace) {
    return routeData({ error: 'workspace is required' }, { status: 400 });
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user,
    workspaceId: workspace,
  });

  const { data, error } = await supabase
    .from('workspace')
    .select('twilio_data, key, token')
    .eq('id', workspace)
    .single();

  if (error || !data) {
    return routeData({ error: 'workspace not found' }, { status: 404 });
  }

  const twilioData = (data.twilio_data ?? {}) as Record<string, unknown>;
  const twilioAccountSid = typeof twilioData['sid'] === 'string' ? (twilioData['sid'] as string) : '';
  const twilioApiKey = (data.key ?? '') as string;
  const twilioApiSecret = (data.token ?? '') as string;

  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: env.TWILIO_APP_SID(),
    incomingAllow: true,
  });
  const token = new twilio.jwt.AccessToken(
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    { identity: user.id }
  );
  token.addGrant(voiceGrant);
  logger.debug("Generated Twilio token");
  return routeData({ token: token.toJwt() });
};

export const generateToken = ({ twilioAccountSid, twilioApiKey, twilioApiSecret, identity }: GenerateTokenParams) => {
  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: env.TWILIO_APP_SID(),
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