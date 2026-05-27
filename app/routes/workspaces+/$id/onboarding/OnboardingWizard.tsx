import { Form, Link, useNavigate, useNavigation, useSearchParams } from "react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  isWizardOnboardingStepId,
  type WizardOnboardingStepId,
  WIZARD_ONBOARDING_STEP_IDS,
  workspaceHasFirstNumber,
} from "@/lib/messaging-onboarding.server";
import type { OnboardingLoaderData } from "../onboarding.loader.server";
import { OnboardingBusinessBasicsStep } from "./OnboardingBusinessBasicsStep";
import { OnboardingChannelsStep } from "./OnboardingChannelsStep";
import { OnboardingFirstNumberStep } from "./OnboardingFirstNumberStep";
import { OnboardingIntroStep } from "./OnboardingIntroStep";
import { OnboardingLaunchStep } from "./OnboardingLaunchStep";
import { OnboardingMessagingServiceStep } from "./OnboardingMessagingServiceStep";
import { OnboardingOverviewCard } from "./OnboardingOverviewCard";
import { OnboardingProviderActionsStep } from "./OnboardingProviderActionsStep";
import { WIZARD_STEP_META } from "./constants";
import { hasVoiceCapability } from "./utils";
import type { OnboardingPendingActions } from "./types";

function resolveWizardStep(currentStep: string | null | undefined): WizardOnboardingStepId {
  if (currentStep === "use_case") {
    return "business_profile";
  }
  if (currentStep && isWizardOnboardingStepId(currentStep)) {
    return currentStep;
  }
  return "business_profile";
}

function readWizardStep(
  urlStep: string | null,
  currentStep: string | null | undefined,
): WizardOnboardingStepId {
  if (urlStep && isWizardOnboardingStepId(urlStep)) {
    return urlStep;
  }
  return resolveWizardStep(currentStep);
}

type OnboardingWizardProps = OnboardingLoaderData & {
  pending: OnboardingPendingActions;
  a2pBlockingIssues: string[];
  a2pErrors: string[];
};

export function OnboardingWizard({
  workspaceId,
  workspaceName,
  userRole,
  onboarding,
  readiness,
  phoneNumbers,
  creditsBalance,
  rcsBlockingIssues,
  pending,
  a2pBlockingIssues,
  a2pErrors,
}: OnboardingWizardProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isReadOnly = userRole !== "owner" && userRole !== "admin";
  const urlStep = searchParams.get("step");
  const [showIntro, setShowIntro] = useState(
    () => onboarding.status === "not_started" && urlStep !== "business_profile",
  );
  const activeStep = showIntro ? null : readWizardStep(urlStep, onboarding.currentStep);

  const stepIndex = activeStep
    ? WIZARD_ONBOARDING_STEP_IDS.indexOf(activeStep)
    : -1;
  const progressValue =
    stepIndex >= 0 ? ((stepIndex + 1) / WIZARD_ONBOARDING_STEP_IDS.length) * 100 : 0;

  const hasFirstNumber = workspaceHasFirstNumber(phoneNumbers ?? []);
  const isFormSubmitting = navigation.state !== "idle";
  const messagingProvisioned = Boolean(onboarding.messagingService.serviceSid);

  const previousStep =
    activeStep && stepIndex > 0 ? WIZARD_ONBOARDING_STEP_IDS[stepIndex - 1]! : null;
  const nextStep =
    activeStep && stepIndex >= 0 && stepIndex < WIZARD_ONBOARDING_STEP_IDS.length - 1
      ? WIZARD_ONBOARDING_STEP_IDS[stepIndex + 1]!
      : null;

  const emergencyEligibleNumbers = new Set(onboarding.emergencyVoice.emergencyEligiblePhoneNumbers);
  const voiceCapableWorkspaceNumbers = (phoneNumbers ?? []).filter(
    (number) => number?.phone_number && number.type === "rented" && hasVoiceCapability(number.capabilities),
  );

  const goToPreviousIntro = () => {
    setShowIntro(true);
    navigate(`/workspaces/${workspaceId}/onboarding`, { replace: true });
  };

  const footerContinue = (() => {
    if (!activeStep || isReadOnly) {
      return null;
    }
    switch (activeStep) {
      case "business_profile":
        return (
          <Button
            type="submit"
            form="onboarding-business-form"
            disabled={pending.isSavingBusinessProfile}
            aria-busy={pending.isSavingBusinessProfile}
          >
            {pending.isSavingBusinessProfile ? "Saving…" : "Save & continue"}
          </Button>
        );
      case "path_selection":
        return (
          <Button
            type="submit"
            form="onboarding-channels-form"
            disabled={pending.isSavingChannels}
            aria-busy={pending.isSavingChannels}
          >
            {pending.isSavingChannels ? "Saving…" : "Save & continue"}
          </Button>
        );
      case "messaging_service":
        if (messagingProvisioned && nextStep) {
          return (
            <Form method="post">
              <input type="hidden" name="_action" value="advance_step" />
              <input type="hidden" name="targetStep" value={nextStep} />
              <Button type="submit" disabled={isFormSubmitting}>
                Next
              </Button>
            </Form>
          );
        }
        return (
          <Button
            type="submit"
            form="onboarding-messaging-form"
            disabled={pending.isBootstrappingMessagingService}
            aria-busy={pending.isBootstrappingMessagingService}
          >
            {pending.isBootstrappingMessagingService
              ? "Provisioning…"
              : "Provision & continue"}
          </Button>
        );
      case "first_number":
        if (hasFirstNumber) {
          return (
            <Form method="post">
              <input type="hidden" name="_action" value="advance_step" />
              <input type="hidden" name="targetStep" value="provider_provisioning" />
              <Button type="submit" disabled={isFormSubmitting}>
                Continue
              </Button>
            </Form>
          );
        }
        return null;
      case "provider_provisioning":
        return (
          <Form method="post">
            <input type="hidden" name="_action" value="advance_step" />
            <input type="hidden" name="targetStep" value="launch_checks" />
            <Button type="submit" disabled={isFormSubmitting}>
              Continue to review
            </Button>
          </Form>
        );
      case "launch_checks":
        return (
          <Button type="button" variant="default" onClick={() => navigate(`/workspaces/${workspaceId}`)}>
            Go to workspace
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-6">
      {!showIntro && activeStep ? (
        <OnboardingOverviewCard
          onboarding={onboarding}
          readiness={readiness}
          workspaceName={workspaceName}
          workspaceId={workspaceId}
          creditsBalance={creditsBalance}
          activeStep={activeStep}
          stepIndex={stepIndex}
          progressValue={progressValue}
        />
      ) : null}

      {showIntro ? (
        <OnboardingIntroStep
          workspaceName={workspaceName}
          workspaceId={workspaceId}
          creditsBalance={creditsBalance}
          onStart={() => {
            setShowIntro(false);
            navigate(`/workspaces/${workspaceId}/onboarding?step=business_profile`, { replace: true });
          }}
        />
      ) : null}

      {!showIntro && activeStep === "business_profile" ? (
        <OnboardingBusinessBasicsStep
          formId="onboarding-business-form"
          onboarding={onboarding}
          isReadOnly={isReadOnly}
          pending={pending}
          voiceCapableWorkspaceNumbers={voiceCapableWorkspaceNumbers}
          emergencyEligibleNumbers={emergencyEligibleNumbers}
        />
      ) : null}

      {!showIntro && activeStep === "path_selection" ? (
        <OnboardingChannelsStep
          formId="onboarding-channels-form"
          onboarding={onboarding}
          isReadOnly={isReadOnly}
          pending={pending}
        />
      ) : null}

      {!showIntro && activeStep === "messaging_service" ? (
        <OnboardingMessagingServiceStep
          formId="onboarding-messaging-form"
          onboarding={onboarding}
          isReadOnly={isReadOnly}
          pending={pending}
          workspaceId={workspaceId}
          creditsBalance={creditsBalance}
        />
      ) : null}

      {!showIntro && activeStep === "first_number" ? (
        <OnboardingFirstNumberStep
          onboarding={onboarding}
          workspaceId={workspaceId}
          phoneNumbers={phoneNumbers}
          creditsBalance={creditsBalance}
          isReadOnly={isReadOnly}
        />
      ) : null}

      {!showIntro && activeStep === "provider_provisioning" ? (
        <OnboardingProviderActionsStep
          onboarding={onboarding}
          rcsBlockingIssues={rcsBlockingIssues}
          isReadOnly={isReadOnly}
          pending={pending}
          a2pBlockingIssues={a2pBlockingIssues}
          a2pErrors={a2pErrors}
        />
      ) : null}

      {!showIntro && activeStep === "launch_checks" ? (
        <OnboardingLaunchStep
          onboarding={onboarding}
          readiness={readiness}
          workspaceId={workspaceId}
          phoneNumbers={phoneNumbers}
        />
      ) : null}

      {!showIntro && activeStep ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {previousStep ? (
            <Button type="button" variant="outline" asChild disabled={isFormSubmitting}>
              <Link to={`?step=${previousStep}`} replace>
                Back
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={goToPreviousIntro} disabled={isFormSubmitting}>
              Back
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {activeStep === "first_number" && !hasFirstNumber && !isReadOnly ? (
              <Form method="post">
                <input type="hidden" name="_action" value="skip_first_number" />
                <Button type="submit" variant="ghost" disabled={isFormSubmitting}>
                  Skip for now
                </Button>
              </Form>
            ) : null}
            {footerContinue}
          </div>
        </div>
      ) : null}

      {!showIntro ? (
        <p className="text-center text-xs text-muted-foreground">
          Step {stepIndex + 1} of {WIZARD_STEP_META.length}:{" "}
          {WIZARD_STEP_META[stepIndex]?.label ?? ""}
        </p>
      ) : null}
    </div>
  );
}
