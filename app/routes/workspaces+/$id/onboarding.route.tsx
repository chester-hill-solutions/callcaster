export { loader } from "./onboarding.loader.server";
export { action } from "./onboarding.action.server";

import { useActionData, useLoaderData, useNavigation } from "react-router";
import { toast } from "sonner";
import {
  flashSearchParamWarning,
  flashServiceAddressSavedParam,
} from "@/hooks/phone";
import { useActionFeedback } from "@/hooks/utils/useActionFeedback";
import { useSearchParamFlash } from "@/hooks/utils/useSearchParamFlash";
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
    workspaceUsers,
    mediaNames,
    inboundQueues,
    scripts,
    audienceCount,
    campaignCount,
  } = useLoaderData<OnboardingLoaderData>();
  const actionData = useActionData<OnboardingActionData>();
  const navigation = useNavigation();

  useSearchParamFlash({
    skipped: (value) => {
      if (value === "first_number") {
        toast.success("Skipped number rental for now. You can add a number later in Settings.");
      }
    },
    provisioned: (value) => {
      if (value === "messaging_service") {
        toast.success("Messaging Service is ready.");
      }
    },
    saved: flashServiceAddressSavedParam,
    warning: flashSearchParamWarning,
  });

  useActionFeedback(actionData, {
    getWarning: (data) => data?.warning,
    warningMessage: (data) => data?.warning ?? "",
    getError: (data) => data?.error,
    getSuccess: (data) =>
      Boolean(data?.success) || Boolean(data?.validationRequest),
    successMessage: (data) =>
      data?.validationRequest
        ? "Verification call started. Enter the code when prompted."
        : (data?.success ?? "Saved"),
  });

  const pendingAction =
    navigation.state === "idle" ? null : String(navigation.formData?.get("_action") ?? "");
  const pending = {
    isSavingWorkspaceName: pendingAction === "save_workspace_name",
    isSavingBusinessProfile: pendingAction === "save_business_profile",
    isSavingChannels: pendingAction === "save_channels",
    isProvisioningA2P: pendingAction === "provision_a2p",
    isSavingRcs: pendingAction === "save_rcs",
    isAttachingRcsSender: pendingAction === "attach_rcs_sender",
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
      actionError={actionData?.error}
      actionData={actionData}
      workspaceUsers={workspaceUsers}
      mediaNames={mediaNames}
      inboundQueues={inboundQueues}
      scripts={scripts}
      audienceCount={audienceCount}
      campaignCount={campaignCount}
    />
  );
}

export { RouteErrorBoundary as ErrorBoundary } from "@/components/shared/RouteErrorBoundary";
