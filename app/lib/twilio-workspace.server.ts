import { parseOptionalString } from "@/lib/parse-utils.server";
import { isObject } from "@/lib/type-safety-utils";

export type PortalConfigView = {
  sendMode: "messaging_service" | "from_number";
  messagingServiceSid: string | null;
};

export type PortalSyncView = {
  accountStatus: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastSyncStatus: "syncing" | "healthy" | "error" | "never_synced";
  numberTypes: string[];
};

export function parsePortalConfigFromTwilioData(
  twilioData: unknown,
): PortalConfigView {
  const config =
    isObject(twilioData) && isObject(twilioData.portalConfig)
      ? twilioData.portalConfig
      : {};
  const sendMode: PortalConfigView["sendMode"] =
    config.sendMode === "messaging_service"
      ? "messaging_service"
      : "from_number";

  return {
    sendMode,
    messagingServiceSid: parseOptionalString(config.messagingServiceSid),
  };
}

export function parsePortalSyncFromTwilioData(twilioData: unknown): PortalSyncView {
  const sync =
    isObject(twilioData) && isObject(twilioData.portalSync)
      ? twilioData.portalSync
      : {};
  const lastSyncStatus: PortalSyncView["lastSyncStatus"] =
    sync.lastSyncStatus === "syncing" ||
    sync.lastSyncStatus === "healthy" ||
    sync.lastSyncStatus === "error" ||
    sync.lastSyncStatus === "never_synced"
      ? sync.lastSyncStatus
      : "never_synced";

  return {
    accountStatus: parseOptionalString(sync.accountStatus),
    lastSyncedAt: parseOptionalString(sync.lastSyncedAt),
    lastSyncError: parseOptionalString(sync.lastSyncError),
    lastSyncStatus,
    numberTypes: Array.isArray(sync.numberTypes)
      ? sync.numberTypes.filter((item): item is string => typeof item === "string")
      : [],
  };
}
