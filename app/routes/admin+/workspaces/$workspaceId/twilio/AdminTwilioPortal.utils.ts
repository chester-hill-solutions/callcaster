import type { WorkspaceTwilioOpsConfig, WorkspaceTwilioSyncSnapshot } from "@/lib/types";

import type { TwilioPageData } from "../loadTwilioData.server";

export const TWILIO_RCS_PROVIDER = "Twilio";
export const TWILIO_RCS_DOCS_URL = "https://www.twilio.com/docs/rcs/onboarding";
export const TWILIO_RCS_SENDERS_URL = "https://console.twilio.com/us1/develop/rcs/senders";

export function formatLabel(value: string) {
    return value
        .split("_")
        .map((part) => part.toUpperCase() === "A2P" ? part.toUpperCase() : part.replace(/^\w/, (char) => char.toUpperCase()))
        .join(" ");
}

export function formatStatusLabel(value: string) {
    return value.replace(/_/g, " ");
}

export function getSyncStatusBadgeVariant(status: WorkspaceTwilioSyncSnapshot["lastSyncStatus"]) {
    switch (status) {
        case "error":
            return "destructive" as const;
        case "healthy":
            return "secondary" as const;
        case "never_synced":
        case "syncing":
            return "outline" as const;
        default: {
            const exhaustiveCheck: never = status;
            return exhaustiveCheck;
        }
    }
}

export function buildWorkspaceSummary({
    config,
    detectedTrafficClass,
    metrics,
}: {
    config: WorkspaceTwilioOpsConfig;
    detectedTrafficClass: string;
    metrics: TwilioPageData["portalSnapshot"]["metrics"];
}) {
    const trafficClass = config.trafficClass !== "unknown" ? config.trafficClass : detectedTrafficClass;
    const sendModeSummary =
        config.sendMode === "messaging_service"
            ? config.messagingServiceSid
                ? "sends through a Messaging Service"
                : "is set to Messaging Service mode but still needs a Messaging Service SID"
            : "sends directly from a phone number";

    return `This workspace is operating as ${formatLabel(trafficClass)}, ${sendModeSummary}, and has ${metrics.recentOutboundCount} recent outbound messages in local history.`;
}
