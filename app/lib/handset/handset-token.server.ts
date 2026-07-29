import { env } from "@/lib/env.server";
import { logger } from "@/lib/logger.server";
import { getWorkspaceById } from "@/lib/workspace-members-db.server";

export type HandsetAccessTokenResult =
  | { token: string; error: null }
  | { token: null; error: string };

export async function createHandsetAccessToken({
  workspaceId,
  clientIdentity,
}: {
  workspaceId: string;
  clientIdentity: string;
}): Promise<HandsetAccessTokenResult> {
  if (!workspaceId || !clientIdentity) {
    return { token: null, error: "workspace and client_identity are required" };
  }

  const data = await getWorkspaceById(workspaceId);

  if (!data) {
    return { token: null, error: "Workspace not found" };
  }

  const rawTwilioData = data.twilio_data;
  const twilioData = (
    typeof rawTwilioData === "string"
      ? JSON.parse(rawTwilioData)
      : rawTwilioData ?? {}
  ) as Record<string, unknown>;
  const twilioAccountSid =
    typeof twilioData.sid === "string" ? twilioData.sid : "";
  const twilioApiKey = (data.key ?? "") as string;
  const twilioApiSecret = (data.token ?? "") as string;

  if (!twilioAccountSid || !twilioApiKey || !twilioApiSecret) {
    return { token: null, error: "Twilio credentials are not configured for this workspace" };
  }

  try {
    const accessTokenModule = await import("twilio/lib/jwt/AccessToken.js");
    const AccessToken = accessTokenModule.default ?? accessTokenModule;
    const voiceGrant = new AccessToken.VoiceGrant({
      outgoingApplicationSid: env.TWILIO_APP_SID(),
      incomingAllow: true,
    });
    const token = new AccessToken(
      twilioAccountSid,
      twilioApiKey,
      twilioApiSecret,
      { identity: clientIdentity },
    );
    token.addGrant(voiceGrant);
    logger.debug("Generated handset Twilio token");
    return { token: token.toJwt(), error: null };
  } catch (err) {
    logger.error("Failed to generate handset Twilio token", err);
    return {
      token: null,
      error: err instanceof Error ? err.message : "Failed to get token",
    };
  }
}
