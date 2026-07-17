import { Form, Link, useNavigate, useNavigation, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  nextWizardStep,
  previousWizardStep,
  wizardStepsForGoal,
} from "@/lib/messaging-onboarding/goals";
import { workspaceHasFirstNumber } from "@/lib/messaging-onboarding/predicates";
import type { OnboardingLoaderData } from "../onboarding.loader.server";
import { OnboardingBusinessBasicsStep } from "./OnboardingBusinessBasicsStep";
import { OnboardingChecklistLinkStep } from "./OnboardingChecklistLinkStep";
import { OnboardingCreditsStep } from "./OnboardingCreditsStep";
import { OnboardingFirstNumberStep } from "./OnboardingFirstNumberStep";
import { OnboardingGoalStep } from "./OnboardingGoalStep";
import { OnboardingIntroStep } from "./OnboardingIntroStep";
import { OnboardingLaunchStep } from "./OnboardingLaunchStep";
import { hasVoiceCapability } from "./utils";
import { readWizardStep } from "./wizard-step-resolution";
import type { OnboardingPendingActions } from "./types";

type OnboardingWizardProps = OnboardingLoaderData & {
  pending: OnboardingPendingActions;
  a2pBlockingIssues: string[];
  a2pErrors: string[];
  actionError?: string | null;
};

export function OnboardingWizard({
  workspaceId,
  workspaceName,
  userRole,
  onboarding,
  readiness,
  phoneNumbers,
  creditsBalance,
  pending,
  workspaceUsers,
  mediaNames,
  inboundQueues,
  scripts,
  audienceCount,
  campaignCount,
  actionError,
}: OnboardingWizardProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isReadOnly = userRole !== "owner" && userRole !== "admin";
  const urlStep = searchParams.get("step");
  const [showIntro, setShowIntro] = useState(
    () => onboarding.status === "not_started" && urlStep !== "business_profile",
  );
  const goal = onboarding.selectedGoal;
  const visibleSteps = wizardStepsForGoal(goal);
  const activeStep = showIntro
    ? null
    : readWizardStep(urlStep, onboarding.currentStep, visibleSteps);
  const stepIndex = activeStep ? visibleSteps.indexOf(activeStep) : -1;

  useEffect(() => {
    if (!activeStep || showIntro) return;
    if (urlStep === activeStep) return;
    navigate(`?step=${activeStep}`, { replace: true });
  }, [activeStep, navigate, showIntro, urlStep]);

  const hasFirstNumber = workspaceHasFirstNumber(phoneNumbers ?? []);
  const isFormSubmitting = navigation.state !== "idle";
  const firstNumberStepIndex = visibleSteps.indexOf("first_number");
  const showSkippedFirstNumberNotice =
    !hasFirstNumber && firstNumberStepIndex >= 0 && stepIndex > firstNumberStepIndex;

  const previousStep =
    activeStep && stepIndex > 0 ? previousWizardStep(activeStep, goal) : null;
  const continueTarget = activeStep ? nextWizardStep(activeStep, goal) : null;

  const emergencyEligibleNumbers = new Set(
    onboarding.emergencyVoice.emergencyEligiblePhoneNumbers,
  );
  const voiceCapableWorkspaceNumbers = (phoneNumbers ?? []).filter(
    (number) =>
      number?.phone_number && number.type === "rented" && hasVoiceCapability(number.capabilities),
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
      case "first_number":
        if (hasFirstNumber && continueTarget) {
          return (
            <Form method="post">
              <input type="hidden" name="_action" value="advance_step" />
              <input type="hidden" name="targetStep" value={continueTarget} />
              <Button type="submit" disabled={isFormSubmitting}>
                Continue
              </Button>
            </Form>
          );
        }
        return null;
      case "launch_checks":
        return (
          <Button
            type="button"
            variant="default"
            onClick={() => navigate(`/workspaces/${workspaceId}`)}
          >
            Go to workspace
          </Button>
        );
      case "audience":
      case "script":
      case "campaign_info":
      case "credits":
        return null;
      default: {
        const _exhaustive: never = activeStep;
        return _exhaustive;
      }
    }
  })();

  return (
    <div className="space-y-6">
      {showSkippedFirstNumberNotice ? (
        <Alert variant="warning" data-testid="skipped-first-number-notice">
          <AlertDescription>
            You can rent or verify a number from workspace Settings before launching campaigns.
          </AlertDescription>
        </Alert>
      ) : null}

      {showIntro ? (
        <OnboardingIntroStep
          workspaceName={workspaceName}
          isReadOnly={isReadOnly}
          isSaving={pending.isSavingWorkspaceName}
          error={actionError}
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
        <OnboardingGoalStep
          formId="onboarding-channels-form"
          onboarding={onboarding}
          isReadOnly={isReadOnly}
          pending={pending}
        />
      ) : null}

      {!showIntro && activeStep === "audience" && continueTarget ? (
        <OnboardingChecklistLinkStep
          title="Audience"
          description="Upload the contacts you want to reach. Every live call, IVR, and SMS campaign uses an audience."
          complete={audienceCount > 0}
          completeLabel={`You have ${audienceCount} audience${audienceCount === 1 ? "" : "s"} ready.`}
          incompleteLabel="Create an audience and upload contacts, then return here to continue."
          actionHref={`/workspaces/${workspaceId}/audiences/new`}
          actionLabel={audienceCount > 0 ? "Manage audiences" : "Upload audience"}
          secondaryHref={`/workspaces/${workspaceId}/audiences`}
          secondaryLabel="View audiences"
          nextStep={continueTarget}
          isReadOnly={isReadOnly}
        />
      ) : null}

      {!showIntro && activeStep === "first_number" ? (
        <OnboardingFirstNumberStep
          onboarding={onboarding}
          workspaceId={workspaceId}
          phoneNumbers={phoneNumbers}
          creditsBalance={creditsBalance}
          isReadOnly={isReadOnly}
          workspaceUsers={workspaceUsers}
          mediaNames={mediaNames}
          inboundQueues={inboundQueues}
          scripts={scripts}
        />
      ) : null}

      {!showIntro && activeStep === "script" && continueTarget ? (
        <OnboardingChecklistLinkStep
          title="Script"
          description={
            goal === "sms_blast"
              ? "Create the message content your SMS campaign will send."
              : "Create the IVR or call script your campaign will use."
          }
          complete={scripts.length > 0}
          completeLabel={`You have ${scripts.length} script${scripts.length === 1 ? "" : "s"} ready.`}
          incompleteLabel="Create a script, then return here to continue."
          actionHref={`/workspaces/${workspaceId}/scripts/new`}
          actionLabel={scripts.length > 0 ? "Manage scripts" : "Create script"}
          secondaryHref={`/workspaces/${workspaceId}/scripts`}
          secondaryLabel="View scripts"
          nextStep={continueTarget}
          isReadOnly={isReadOnly}
        />
      ) : null}

      {!showIntro && activeStep === "campaign_info" && continueTarget ? (
        <OnboardingChecklistLinkStep
          title="Campaign info"
          description="Create a campaign that connects your audience, phone number, and script to your goal."
          complete={campaignCount > 0}
          completeLabel={`You have ${campaignCount} campaign${campaignCount === 1 ? "" : "s"} ready.`}
          incompleteLabel="Create a campaign with a name and the assets you just set up."
          actionHref={`/workspaces/${workspaceId}/campaigns/new`}
          actionLabel={campaignCount > 0 ? "Manage campaigns" : "Create campaign"}
          secondaryHref={`/workspaces/${workspaceId}/campaigns`}
          secondaryLabel="View campaigns"
          nextStep={continueTarget}
          isReadOnly={isReadOnly}
        />
      ) : null}

      {!showIntro && activeStep === "credits" ? (
        <OnboardingCreditsStep
          workspaceId={workspaceId}
          creditsBalance={creditsBalance}
          isReadOnly={isReadOnly}
        />
      ) : null}

      {!showIntro && activeStep === "launch_checks" ? (
        <OnboardingLaunchStep
          onboarding={onboarding}
          readiness={readiness}
          workspaceId={workspaceId}
          phoneNumbers={phoneNumbers}
          audienceCount={audienceCount}
          campaignCount={campaignCount}
          scriptCount={scripts.length}
          creditsBalance={creditsBalance}
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
            <Button
              type="button"
              variant="outline"
              onClick={goToPreviousIntro}
              disabled={isFormSubmitting}
            >
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
    </div>
  );
}
