export const TWILIO_WEBHOOK_EXACT_PATHS = [
  "/api/call",
  "/api/call-status",
  "/api/caller-id/status",
  "/api/dial/status",
  "/api/email-vm",
  "/api/inbound",
  "/api/inbound-handset",
  "/api/inbound-handset-dial-end",
  "/api/inbound-sms",
  "/api/inbound-verification",
  "/api/ivr/status",
  "/api/recording",
  "/api/sms/status",
  "/api/twilio/trusthub/status",
] as const;

export const TWILIO_WEBHOOK_PATH_PREFIXES = [
  "/api/acd-router/",
  "/api/auto-dial/",
  "/api/connect-campaign-conference/",
  "/api/dial/",
  "/api/inbound-ivr/",
  "/api/ivr/",
] as const;

const TWILIO_WEBHOOK_EXCLUDED_PATHS = new Set([
  "/api/auto-dial/end",
  // Event Streams are JSON and use a different auth model than Twilio's
  // form-encoded Programmable Messaging/Voice webhooks.
  "/api/twilio/a2p/events",
]);

const TWILIO_WEBHOOK_EXACT_PATH_SET = new Set<string>(TWILIO_WEBHOOK_EXACT_PATHS);

export function isTwilioWebhookPath(pathname: string): boolean {
  if (TWILIO_WEBHOOK_EXCLUDED_PATHS.has(pathname)) {
    return false;
  }
  if (TWILIO_WEBHOOK_EXACT_PATH_SET.has(pathname)) {
    return true;
  }
  return TWILIO_WEBHOOK_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}
