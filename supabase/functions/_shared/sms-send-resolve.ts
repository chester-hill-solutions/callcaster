/** Mirrors app/lib/sms-send-resolve.ts for Edge Functions (no app path imports). */

export type PortalConfigLite = {
  sendMode: string;
  messagingServiceSid: string | null;
};

export function resolveTwilioSmsMessagingServiceSid(args: {
  explicitRequestSid: string | null;
  campaignSmsSendMode: string | null | undefined;
  campaignSmsMessagingServiceSid: string | null | undefined;
  portalConfig: PortalConfigLite;
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

  return portalSid;
}
