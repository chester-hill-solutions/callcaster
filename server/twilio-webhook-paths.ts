export const TWILIO_WEBHOOK_PATH_PREFIXES = [
  "/api/call",
  "/api/dial",
  "/api/inbound",
  "/api/inbound-handset",
  "/api/inbound-ivr",
  "/api/ivr",
  "/api/call-status",
  "/api/auto-dial",
  "/api/acd-router",
  "/api/recording",
  "/api/sms/status",
  "/api/caller-id/status",
  "/api/email-vm",
  "/api/connect-campaign-conference",
  "/api/twilio/trusthub/status",
  "/api/twilio/a2p/events",
] as const;

export function isTwilioWebhookPath(pathname: string): boolean {
  return TWILIO_WEBHOOK_PATH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}
