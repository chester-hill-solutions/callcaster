export { loader } from "./onboarding.loader.server";
export { action } from "./onboarding.action.server";

import { useActionData, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import type { OnboardingActionData } from "./onboarding.action.server";
import type { OnboardingLoaderData } from "./onboarding.loader.server";
import { OnboardingWizard } from "./onboarding/OnboardingWizard";

export default function WorkspaceMessagingOnboardingRoute() {
  const {
    workspaceId,
    workspaceName,
    userRole,
    onboarding,
    readiness,
    phoneNumbers,
    creditsBalance,
    rcsBlockingIssues,
  } = useLoaderData<OnboardingLoaderData>();
  const actionData = useActionData<OnboardingActionData>();
  const navigation = useNavigation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const skipped = searchParams.get("skipped");
    const provisioned = searchParams.get("provisioned");
    const warning = searchParams.get("warning");
    if (!skipped && !provisioned && !warning) {
      return;
    }
    if (skipped === "first_number") {
      toast.success("Skipped number rental for now. You can add a number later in Settings.");
    }
    if (provisioned === "messaging_service") {
      toast.success("Messaging Service is ready.");
    }
    if (warning) {
      toast.warning(warning);
    }
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("skipped");
        next.delete("provisioned");
        next.delete("warning");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  useActionFeedback(actionData, {
    getWarning: (data) => data?.warning,
    warningMessage: (data) => data?.warning ?? "",
    getError: (data) => data?.error,
    getSuccess: (data) => Boolean(data?.success),
    successMessage: (data) => data?.success ?? "Saved",
  });

  const pendingAction =
    navigation.state === "idle" ? null : String(navigation.formData?.get("_action") ?? "");
  const pending = {
    isSavingBusinessProfile: pendingAction === "save_business_profile",
    isSavingChannels: pendingAction === "save_channels",
    isBootstrappingMessagingService: pendingAction === "bootstrap_messaging_service",
    isProvisioningA2P: pendingAction === "provision_a2p",
    isSavingRcs: pendingAction === "save_rcs",
    isReviewingEmergencyVoice: pendingAction === "review_emergency_voice",
    isVerifyingCallerId: pendingAction === "verify_caller_id",
  };
  const a2pBlockingIssues = onboarding.reviewState.blockingIssues;
  const a2pErrors = [
    onboarding.a2p10dlc.rejectionReason,
    onboarding.reviewState.lastError,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

  return (
    <OnboardingWizard
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      userRole={userRole}
      onboarding={onboarding}
      readiness={readiness}
      phoneNumbers={phoneNumbers}
      creditsBalance={creditsBalance}
      rcsBlockingIssues={rcsBlockingIssues}
      pending={pending}
      a2pBlockingIssues={a2pBlockingIssues}
      a2pErrors={a2pErrors}
    />
  );
}
