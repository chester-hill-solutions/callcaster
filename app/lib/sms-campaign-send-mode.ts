import type { Json } from "@/lib/database.types";

export type CampaignSmsSendMode = "messaging_service" | "from_number";

export function parseCampaignSmsSendMode(
  value: unknown,
): CampaignSmsSendMode | null {
  if (value === "messaging_service" || value === "from_number") {
    return value;
  }
  return null;
}

function workspaceNumberHasSmsCapability(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    return false;
  }
  const sms = (capabilities as Record<string, unknown>).sms;
  return sms === true || sms === "true";
}

/**
 * Messaging Service is usable only when a SID exists and there is evidence of
 * sender capacity: onboarding attached senders and/or at least one SMS-capable
 * workspace number (pool / legacy setups).
 */
export function workspaceMessagingServiceHasAvailableSenders(args: {
  messagingServiceSid: string | null | undefined;
  attachedSenderPhoneNumbers: string[];
  workspaceNumbers: Array<{
    phone_number?: string | null;
    capabilities?: Json | null;
  }>;
}): boolean {
  if (!String(args.messagingServiceSid ?? "").trim()) {
    return false;
  }
  if (args.attachedSenderPhoneNumbers.length > 0) {
    return true;
  }
  return (args.workspaceNumbers ?? []).some((n) =>
    workspaceNumberHasSmsCapability(n.capabilities),
  );
}
