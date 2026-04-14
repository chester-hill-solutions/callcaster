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
