import twilio from "twilio";

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
  /** @deprecated Drizzle lookup — ignored when workspaceId is set. */
  null?: unknown;
}): Promise<HandsetAccessTokenResult> {
  if (!workspaceId || !clientIdentity) {
    return { token: null, error: "workspace and client_identity are required" };
  }

  const data = await getWorkspaceById(workspaceId);

  if (!data) {
    return { token: null, error: "Workspace not found" };
  }

  const twilioData = (data.twilio_data ?? {}) as Record<string, unknown>;
  const twilioAccountSid =
    typeof twilioData.sid === "string" ? twilioData.sid : "";
  const twilioApiKey = (data.key ?? "") as string;
  const twilioApiSecret = (data.token ?? "") as string;

  if (!twilioAccountSid || !twilioApiKey || !twilioApiSecret) {
    return { token: null, error: "Twilio credentials are not configured for this workspace" };
  }

  try {
    const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: env.TWILIO_APP_SID(),
      incomingAllow: true,
    });
    const token = new twilio.jwt.AccessToken(
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
