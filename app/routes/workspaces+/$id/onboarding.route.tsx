export { loader } from "./onboarding.loader.server";
export { action } from "./onboarding.action.server";

import { useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import type { OnboardingActionData } from "./onboarding.action.server";
import type { OnboardingLoaderData } from "./onboarding.loader.server";
import { OnboardingBusinessBasicsStep } from "./onboarding/OnboardingBusinessBasicsStep";
import { OnboardingChannelsStep } from "./onboarding/OnboardingChannelsStep";
import { OnboardingMessagingServiceStep } from "./onboarding/OnboardingMessagingServiceStep";
import { OnboardingOverviewCard } from "./onboarding/OnboardingOverviewCard";
import { OnboardingProviderActionsStep } from "./onboarding/OnboardingProviderActionsStep";
import { hasVoiceCapability } from "./onboarding/utils";

export default function WorkspaceMessagingOnboardingRoute() {
  const { workspaceId, workspaceName, userRole, onboarding, readiness, phoneNumbers, rcsBlockingIssues } =
    useLoaderData<OnboardingLoaderData>();
  const actionData = useActionData<OnboardingActionData>();
  const navigation = useNavigation();

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.success) {
      toast.success(actionData.success);
    }
  }, [actionData]);

  const isReadOnly = userRole !== "owner" && userRole !== "admin";
  const pendingAction =
    navigation.state === "idle" ? null : String(navigation.formData?.get("_action") ?? "");
  const pending = {
    isSavingBusinessProfile: pendingAction === "save_business_profile",
    isSavingChannels: pendingAction === "save_channels",
    isBootstrappingMessagingService: pendingAction === "bootstrap_messaging_service",
    isProvisioningA2P: pendingAction === "provision_a2p",
    isSavingRcs: pendingAction === "save_rcs",
    isReviewingEmergencyVoice: pendingAction === "review_emergency_voice",
  };
  const a2pBlockingIssues = onboarding.reviewState.blockingIssues;
  const a2pErrors = [
    onboarding.a2p10dlc.rejectionReason,
    onboarding.reviewState.lastError,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const emergencyEligibleNumbers = new Set(onboarding.emergencyVoice.emergencyEligiblePhoneNumbers);
  const voiceCapableWorkspaceNumbers = (phoneNumbers ?? []).filter(
    (number) => number?.phone_number && number.type === "rented" && hasVoiceCapability(number.capabilities),
  );

  return (
    <div className="space-y-6">
      <OnboardingOverviewCard
        onboarding={onboarding}
        readiness={readiness}
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        phoneNumbers={phoneNumbers}
      />
      <OnboardingBusinessBasicsStep
        onboarding={onboarding}
        isReadOnly={isReadOnly}
        pending={pending}
        voiceCapableWorkspaceNumbers={voiceCapableWorkspaceNumbers}
        emergencyEligibleNumbers={emergencyEligibleNumbers}
      />
      <OnboardingChannelsStep onboarding={onboarding} isReadOnly={isReadOnly} pending={pending} />
      <OnboardingMessagingServiceStep onboarding={onboarding} isReadOnly={isReadOnly} pending={pending} />
      <OnboardingProviderActionsStep
        onboarding={onboarding}
        rcsBlockingIssues={rcsBlockingIssues}
        isReadOnly={isReadOnly}
        pending={pending}
        a2pBlockingIssues={a2pBlockingIssues}
        a2pErrors={a2pErrors}
      />
    </div>
  );
}
