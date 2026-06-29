/**
 * Parse workspace.twilio_data JSON for Twilio REST clients and webhook validation.
 * Supports camelCase and snake_case keys used across the app and older rows.
 */
export type TwilioWorkspaceCredentials = {
  sid: string;
  authToken: string;
};

export function readTwilioWorkspaceCredentials(
  twilioData: unknown,
): TwilioWorkspaceCredentials | null {
  if (!twilioData || typeof twilioData !== "object" || Array.isArray(twilioData)) {
    return null;
  }
  const o = twilioData as Record<string, unknown>;
  const sid =
    (typeof o.sid === "string" && o.sid.trim()) ||
    (typeof o.account_sid === "string" && o.account_sid.trim()) ||
    (typeof o.accountSid === "string" && o.accountSid.trim()) ||
    "";
  const authToken =
    (typeof o.authToken === "string" && o.authToken.trim()) ||
    (typeof o.auth_token === "string" && o.auth_token.trim()) ||
    "";
  if (!sid || !authToken) return null;
  return { sid, authToken };
}

/** Auth token for Twilio webhook signature validation (Edge).
 *  Accepts either credential shape (`{ sid, authToken }` or `{ accountSid, authToken }`). */
export function resolveTwilioWebhookAuthToken(
  creds: { authToken?: string } | null,
): string | null {
  if (creds?.authToken) {
    return creds.authToken;
  }
  const readEnv = (key: string): string | undefined => Deno.env.get(key);
  const environment = readEnv("ENVIRONMENT") ?? "";
  const isProduction =
    environment === "production" || Boolean(readEnv("DENO_DEPLOYMENT_ID"));
  if (!isProduction) {
    const token = readEnv("TWILIO_AUTH_TOKEN");
    return token?.trim() ? token.trim() : null;
  }
  return null;
}
