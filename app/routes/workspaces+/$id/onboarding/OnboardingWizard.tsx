import {
  Form,
  useFetcher,
  useLocation,
  useNavigate,
  useNavigation,
  useSearchParams,
} from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  isWizardOnboardingStepId,
  type WizardOnboardingStepId,
  WIZARD_ONBOARDING_STEP_IDS,
  workspaceHasFirstNumber,
} from "@/lib/messaging-onboarding.server";
import type { OnboardingLoaderData } from "../onboarding.loader.server";
import type { OnboardingActionData } from "../onboarding.action.server";
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

function readInitialWizardStep(
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
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const advanceFetcher = useFetcher<OnboardingActionData>();
  const userNavigatedRef = useRef(false);
  const isReadOnly = userRole !== "owner" && userRole !== "admin";
  const urlStep = searchParams.get("step");
  const [showIntro, setShowIntro] = useState(
    () => onboarding.status === "not_started" && urlStep !== "business_profile",
  );
  const wizardStep = readInitialWizardStep(urlStep, onboarding.currentStep);

  const activeStep = showIntro ? null : wizardStep;

  const stepIndex = activeStep
    ? WIZARD_ONBOARDING_STEP_IDS.indexOf(activeStep)
    : -1;
  const progressValue =
    stepIndex >= 0 ? ((stepIndex + 1) / WIZARD_ONBOARDING_STEP_IDS.length) * 100 : 0;

  const hasFirstNumber = workspaceHasFirstNumber(phoneNumbers ?? []);

  const syncStepToUrl = useCallback(
    (step: WizardOnboardingStepId) => {
      const params = new URLSearchParams(location.search);
      params.set("step", step);
      const search = params.toString();
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : "" },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const goToStep = useCallback(
    (step: WizardOnboardingStepId) => {
      setShowIntro(false);
      syncStepToUrl(step);
    },
    [syncStepToUrl],
  );

  useEffect(() => {
    if (showIntro || advanceFetcher.state !== "idle" || !advanceFetcher.data?.success) {
      return;
    }
    const resolved = resolveWizardStep(onboarding.currentStep);
    if (urlStep !== resolved) {
      syncStepToUrl(resolved);
    }
  }, [
    advanceFetcher.data,
    advanceFetcher.state,
    onboarding.currentStep,
    showIntro,
    syncStepToUrl,
    urlStep,
  ]);

  const goToPrevious = useCallback(() => {
    if (!activeStep) {
      return;
    }
    const index = WIZARD_ONBOARDING_STEP_IDS.indexOf(activeStep);
    if (index <= 0) {
      userNavigatedRef.current = true;
      setShowIntro(true);
      navigate(location.pathname, { replace: true });
      return;
    }
    goToStep(WIZARD_ONBOARDING_STEP_IDS[index - 1]!);
  }, [activeStep, goToStep, location.pathname, navigate]);

  const advanceToStep = useCallback(
    (targetStep: WizardOnboardingStepId) => {
      if (isReadOnly) {
        goToStep(targetStep);
        return;
      }
      const formData = new FormData();
      formData.set("_action", "advance_step");
      formData.set("targetStep", targetStep);
      advanceFetcher.submit(formData, { method: "post" });
      goToStep(targetStep);
    },
    [advanceFetcher, goToStep, isReadOnly],
  );

  const goToNext = useCallback(() => {
    if (!activeStep) {
      return;
    }
    const index = WIZARD_ONBOARDING_STEP_IDS.indexOf(activeStep);
    const next = WIZARD_ONBOARDING_STEP_IDS[index + 1];
    if (next) {
      advanceToStep(next);
    }
  }, [activeStep, advanceToStep]);

  const emergencyEligibleNumbers = new Set(onboarding.emergencyVoice.emergencyEligiblePhoneNumbers);
  const voiceCapableWorkspaceNumbers = (phoneNumbers ?? []).filter(
    (number) => number?.phone_number && number.type === "rented" && hasVoiceCapability(number.capabilities),
  );

  const isFormSubmitting = navigation.state !== "idle";
  const isAdvancingStep = advanceFetcher.state !== "idle";
  const isSubmitting = isFormSubmitting || isAdvancingStep;
  const messagingProvisioned = Boolean(onboarding.messagingService.serviceSid);

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
        if (messagingProvisioned) {
          return (
            <Button type="button" onClick={goToNext} disabled={isSubmitting}>
              Next
            </Button>
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
            <Button type="button" onClick={() => advanceToStep("provider_provisioning")} disabled={isSubmitting}>
              Continue
            </Button>
          );
        }
        return null;
      case "provider_provisioning":
        return (
          <Button type="button" onClick={() => advanceToStep("launch_checks")} disabled={isSubmitting}>
            Continue to review
          </Button>
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
            goToStep("business_profile");
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
          <Button type="button" variant="outline" onClick={goToPrevious} disabled={isFormSubmitting}>
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {activeStep === "first_number" && !hasFirstNumber && !isReadOnly ? (
              <Form method="post">
                <input type="hidden" name="_action" value="skip_first_number" />
                <Button type="submit" variant="ghost" disabled={isSubmitting}>
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
