import { json } from "@remix-run/node";
import twilio from "twilio";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { verifyAuth } from "@/lib/supabase.server";
import { requireWorkspaceAccess } from "@/lib/database.server";
import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabaseClient: supabase, user } = await verifyAuth(request);
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const workspace = url.searchParams.get("workspace") ?? "";
  const clientIdentity = url.searchParams.get("client_identity") ?? "";

  if (!workspace || !clientIdentity) {
    return json(
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
    return json({ error: "Workspace not found" }, { status: 404 });
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
  return json({ token: token.toJwt() });
};
