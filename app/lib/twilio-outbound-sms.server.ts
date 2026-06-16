import { bodyHasUrls } from "@/lib/sms.server";
import { resolveTwilioSmsMessagingServiceSid } from "@/lib/sms-send-resolve";
import type { TwilioMessageIntent, WorkspaceTwilioOpsConfig } from "@/lib/types";

export function buildTwilioOutboundSmsCreateParams(args: {
  body: string;
  to: string;
  from: string;
  media?: string[];
  statusCallback: string;
  portalConfig: WorkspaceTwilioOpsConfig;
  messageIntent?: TwilioMessageIntent | null;
  explicitMessagingServiceSid?: string | null;
  campaignSmsSendMode?: string | null;
  campaignSmsMessagingServiceSid?: string | null;
}) {
  const resolvedMessagingServiceSid = resolveTwilioSmsMessagingServiceSid({
    explicitRequestSid: args.explicitMessagingServiceSid ?? null,
    campaignSmsSendMode: args.campaignSmsSendMode,
    campaignSmsMessagingServiceSid: args.campaignSmsMessagingServiceSid,
    portalConfig: args.portalConfig,
  });
  const resolvedMessageIntent =
    args.messageIntent ?? args.portalConfig.defaultMessageIntent;
  const effectiveFrom = String(args.from ?? "").trim();

  if (!resolvedMessagingServiceSid && !effectiveFrom) {
    throw new Error("Missing sender: caller_id or Messaging Service required");
  }

  const media = args.media ?? [];

  return {
    body: args.body,
    to: args.to,
    statusCallback: args.statusCallback,
    ...(media.length > 0 ? { mediaUrl: media } : {}),
    ...(resolvedMessagingServiceSid
      ? {
          messagingServiceSid: resolvedMessagingServiceSid,
          ...(bodyHasUrls(args.body) ? { shortenUrls: true } : {}),
        }
      : { from: effectiveFrom }),
    ...(resolvedMessageIntent ? { messageIntent: resolvedMessageIntent } : {}),
  };
}
