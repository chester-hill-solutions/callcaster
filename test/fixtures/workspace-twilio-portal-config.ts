import type { WorkspaceTwilioOpsConfig } from "@/lib/types";

export function makePortalConfig(
  overrides: Partial<WorkspaceTwilioOpsConfig> = {},
): WorkspaceTwilioOpsConfig {
  return {
    trafficClass: "unknown",
    throughputProduct: "none",
    multiTenancyMode: "none",
    trafficShapingEnabled: false,
    defaultMessageIntent: null,
    sendMode: "from_number",
    messagingServiceSid: null,
    onboardingStatus: "not_started",
    smsSenderClass: "unknown",
    smsTargetMps: 1,
    voiceTargetCps: 1,
    voiceConcurrentCallLimit: 100,
    parallelDispatchEnabled: false,
    supportNotes: "",
    updatedAt: null,
    updatedBy: null,
    auditTrail: [],
    ...overrides,
  };
}
