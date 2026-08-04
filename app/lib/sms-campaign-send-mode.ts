import type { Json } from "@/lib/db-types";

export type CampaignSmsSendMode = "messaging_service" | "from_number";

export function parseCampaignSmsSendMode(
  value: unknown,
): CampaignSmsSendMode | null {
  if (value === "messaging_service" || value === "from_number") {
    return value;
  }
  return null;
}

/**
 * Sentinel `from` value meaning "let the Messaging Service choose the sender".
 * The chat composer offers this alongside the workspace's real numbers so the
 * Messaging Service is one selectable sender rather than a mode that removes
 * the picker entirely.
 */
export const MESSAGING_SERVICE_SENDER_VALUE = "__messaging_service__";

export type ChatSenderSelection =
  | { mode: "messaging_service"; fromNumber: "" }
  | { mode: "from_number"; fromNumber: string };

/**
 * Interprets a chat send's `from` field.
 *
 * An explicitly chosen number always wins over the workspace's Messaging
 * Service — overriding it is what previously made a picked sender silently
 * unused. Omitting `from` entirely is not a choice, so it still falls back to
 * the workspace default for callers (the API) that never send the field.
 *
 * A sentinel that arrives when the service is unavailable — submitted from a
 * tab opened before onboarding changed — degrades to an empty `from_number`
 * rather than sending via a service the workspace can no longer use; the caller
 * then rejects it with the normal "sending number required" validation.
 */
export function parseChatSenderSelection(args: {
  rawFrom: string | null | undefined;
  messagingServiceAvailable: boolean;
}): ChatSenderSelection {
  const raw = String(args.rawFrom ?? "").trim();

  if (raw === MESSAGING_SERVICE_SENDER_VALUE || raw === "") {
    return args.messagingServiceAvailable
      ? { mode: "messaging_service", fromNumber: "" }
      : { mode: "from_number", fromNumber: "" };
  }

  return { mode: "from_number", fromNumber: raw };
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
