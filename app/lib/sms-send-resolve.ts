import type { WorkspaceTwilioOpsConfig } from "@/lib/types";

/**
 * Resolves Twilio Messaging Service SID for outbound SMS.
 * Precedence: explicit API override → per-campaign MS mode → workspace portal defaults.
 */
export function resolveTwilioSmsMessagingServiceSid(args: {
  explicitRequestSid: string | null;
  campaignSmsSendMode: string | null | undefined;
  campaignSmsMessagingServiceSid: string | null | undefined;
  portalConfig: WorkspaceTwilioOpsConfig;
}): string | null {
  if (args.explicitRequestSid) {
    return args.explicitRequestSid;
  }

  const portalSid =
    args.portalConfig.sendMode === "messaging_service"
      ? args.portalConfig.messagingServiceSid
      : null;

  if (args.campaignSmsSendMode === "messaging_service") {
    const sid = String(args.campaignSmsMessagingServiceSid ?? "").trim();
    return sid || portalSid;
  }

  if (args.campaignSmsSendMode === "from_number") {
    return null;
  }

  // Legacy campaigns (sms_send_mode null): preserve workspace portal behavior.
  return portalSid;
}

export function messageCampaignRequiresCallerId(
  campaignSmsSendMode: string | null | undefined,
): boolean {
  return campaignSmsSendMode !== "messaging_service";
}
