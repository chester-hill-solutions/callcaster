import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";
import { workspaceHasFirstNumber } from "@/lib/messaging-onboarding.server";

export function deriveWorkspaceMessagingReadiness({
  onboarding,
  workspaceNumbers,
  recentOutboundCount,
}: {
  onboarding: WorkspaceMessagingOnboardingState;
  workspaceNumbers: Array<{
    phone_number?: string | null;
    type?: string | null;
    capabilities?: unknown;
  }>;
  recentOutboundCount: number;
}): WorkspaceMessagingReadiness {
  const numbers = workspaceNumbers.filter(Boolean);
  const rentedNumbers = numbers.filter((number) => number.type === "rented");
  const callerIds = numbers.filter((number) => number.type === "caller_id");
  const hasLegacyTraffic = recentOutboundCount > 0 || numbers.length > 0;
  const messagingReady = Boolean(onboarding.messagingService.serviceSid);
  const hasValidatedEmergencyAddress =
    onboarding.emergencyVoice.address.status === "validated";
  const businessCountryCode = onboarding.emergencyVoice.address.countryCode
    .trim()
    .toUpperCase();
  const isCanadianBusiness =
    businessCountryCode === "CA" || businessCountryCode === "CANADA";
  const voiceReady =
    !onboarding.selectedChannels.includes("voice_compliance") ||
    (onboarding.emergencyVoice.enabled &&
      hasValidatedEmergencyAddress &&
      onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length > 0);

  const warnings: string[] = [];
  if (!messagingReady) {
    warnings.push("Messaging Service has not been provisioned yet.");
  }
  if (
    onboarding.selectedChannels.includes("a2p10dlc") &&
    !isCanadianBusiness &&
    onboarding.a2p10dlc.status !== "approved" &&
    onboarding.a2p10dlc.status !== "live"
  ) {
    warnings.push("A2P 10DLC registration is not approved yet.");
  }
  if (
    onboarding.selectedChannels.includes("voice_compliance") &&
    !voiceReady
  ) {
    warnings.push("Emergency voice readiness is incomplete.");
  }
  if (callerIds.length > 0 && rentedNumbers.length === 0) {
    warnings.push(
      "Only verified caller IDs are present. Outbound is supported, but inbound SMS and calls require a rented number.",
    );
  }
  if (!workspaceHasFirstNumber(numbers)) {
    warnings.push("No phone number yet.");
  }

  const shouldRedirectToOnboarding = !hasLegacyTraffic && warnings.length > 0;

  return {
    shouldRedirectToOnboarding,
    shouldShowOnboardingBanner: warnings.length > 0,
    messagingReady,
    voiceReady,
    legacyMode: hasLegacyTraffic,
    sendMode:
      messagingReady &&
      onboarding.messagingService.desiredSendMode === "messaging_service"
        ? "messaging_service"
        : "from_number",
    messagingServiceSid: onboarding.messagingService.serviceSid,
    selectedChannels: onboarding.selectedChannels,
    currentStep: onboarding.currentStep,
    warnings,
  };
}
