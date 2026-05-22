
import { data as routeData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import twilio from "twilio";




export const loader = async ({ request }: LoaderFunctionArgs) => {  const { logger } = await import("@/lib/logger.server");
  const { env } = await import("@/lib/env.server");
  const { verifyAuth } = await import("@/lib/supabase.server");
  const { requireWorkspaceAccess } = await import("@/lib/database.server");

  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    return routeData({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";
  const clientIdentity = url.searchParams.get("client_identity") ?? "";

  if (!workspace || !clientIdentity) {
    return routeData(
      { error: "workspace and client_identity are required" },
      { status: 400 }
    );
  }

  await requireWorkspaceAccess({
    supabaseClient: supabase,
    user,
    workspaceId: workspace,
  });

  const { data, error } = await supabase
    .from("workspace")
    .select("twilio_data, key, token")
    .eq("id", workspace)
    .single();

  if (error || !data) {
    return routeData({ error: "Workspace not found" }, { status: 404 });
  }

  const twilioData = (data.twilio_data ?? {}) as Record<string, unknown>;
  const twilioAccountSid =
    typeof twilioData["sid"] === "string" ? (twilioData["sid"] as string) : "";
  const twilioApiKey = (data.key ?? "") as string;
  const twilioApiSecret = (data.token ?? "") as string;

  const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
    outgoingApplicationSid: env.TWILIO_APP_SID(),
    incomingAllow: true,
  });
  const token = new twilio.jwt.AccessToken(
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    { identity: clientIdentity }
  );
  token.addGrant(voiceGrant);
  logger.debug("Generated handset Twilio token");
  return routeData({ token: token.toJwt() });
};
