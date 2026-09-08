/**
 * Parse workspace.twilio_data JSON for Twilio REST clients and webhook validation.
 * Ported from Postgres Edge `_shared/twilio-workspace-credentials.ts`.
 */
export type TwilioWorkspaceCredentials = {
  sid: string;
  authToken: string;
};

/**
 * Auth token for Twilio webhook signature validation.
 * Uses workspace/subaccount credentials only; no main-account fallback.
 */
export function resolveTwilioWebhookAuthToken(
  creds: TwilioWorkspaceCredentials | null,
): string | null {
  return creds?.authToken ?? null;
}

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

export type TwilioRestBasicAuth = {
  username: string;
  password: string;
  source: "api-key" | "auth-token";
};

/**
 * Credentials for a direct HTTPS call to api.twilio.com (recording media,
 * anything the SDK client does not wrap). ADR-0011: REST traffic uses the
 * workspace API Key (`workspace.key` / `workspace.token`) when one exists,
 * the same pair `createWorkspaceTwilioInstance` hands the SDK, so a
 * subaccount Auth Token that has gone stale in `twilio_data` does not take
 * these calls down with it. The Auth Token remains the fallback for
 * workspaces provisioned before API Keys.
 */
export function resolveTwilioRestBasicAuth(workspace: {
  key?: unknown;
  token?: unknown;
  twilio_data: unknown;
}): TwilioRestBasicAuth | null {
  const apiKey = typeof workspace.key === "string" ? workspace.key.trim() : "";
  const apiSecret = typeof workspace.token === "string" ? workspace.token.trim() : "";
  if (apiKey && apiSecret) {
    return { username: apiKey, password: apiSecret, source: "api-key" };
  }
  const creds = readTwilioWorkspaceCredentials(workspace.twilio_data);
  if (!creds) return null;
  return { username: creds.sid, password: creds.authToken, source: "auth-token" };
}
