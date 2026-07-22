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
import type { OnboardingActionData } from "../onboarding.action.server";
import { OnboardingBusinessIdentityStep } from "./OnboardingBusinessIdentityStep";
import { OnboardingBusinessProgramStep } from "./OnboardingBusinessProgramStep";
import { OnboardingChecklistLinkStep } from "./OnboardingChecklistLinkStep";
import { OnboardingCreditsStep } from "./OnboardingCreditsStep";
import { OnboardingFirstNumberStep } from "./OnboardingFirstNumberStep";
import { OnboardingGoalStep } from "./OnboardingGoalStep";
import { OnboardingIntroStep } from "./OnboardingIntroStep";
import { OnboardingLaunchStep } from "./OnboardingLaunchStep";
import { readWizardStep } from "./wizard-step-resolution";
import type { OnboardingPendingActions } from "./types";

type OnboardingWizardProps = OnboardingLoaderData & {
  pending: OnboardingPendingActions;
  a2pBlockingIssues: string[];
  a2pErrors: string[];
  actionError?: string | null;
  actionData?: OnboardingActionData;
};

function isBusinessPrefixStep(step: string | null): boolean {
  return step === "business_identity" || step === "business_program";
}

function checklistCreateHref(
  workspaceId: string,
  resourcePath: "audiences/new" | "scripts/new" | "campaigns/new",
  step: "audience" | "script" | "campaign_info",
): string {
  const returnTo = encodeURIComponent(
    `/workspaces/${workspaceId}/onboarding?step=${step}`,
  );
  return `/workspaces/${workspaceId}/${resourcePath}?returnTo=${returnTo}`;
}

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
  actionData,
}: OnboardingWizardProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isReadOnly = userRole !== "owner" && userRole !== "admin";
  const urlStep = searchParams.get("step");
  const [showIntro, setShowIntro] = useState(
    () => onboarding.status === "not_started" && !isBusinessPrefixStep(urlStep),
  );
  const goal = onboarding.selectedGoal;
  const visibleSteps = wizardStepsForGoal(goal);
  const activeStep = showIntro
    ? null
    : readWizardStep(urlStep, onboarding.currentStep, visibleSteps);
  const stepIndex = activeStep ? visibleSteps.indexOf(activeStep) : -1;

  /**
   * @effect Keep the `?step=` search param aligned with the resolved active wizard step after goal-driven step lists change.
   * @effect-deps activeStep (canonical step after goal/visibility resolution); urlStep (current query); showIntro (skip while intro is showing); navigate (replace navigation)
   * @effect-side-effects navigation — `navigate(..., { replace: true })` updates the URL without adding history entries
   * @effect-why-not-loader Step resolution depends on client-only intro state and goal-derived visibility; a loader cannot replace the query mid-wizard without a client redirect.
   */
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

  const goToPreviousIntro = () => {
    setShowIntro(true);
    navigate(`/workspaces/${workspaceId}/onboarding`, { replace: true });
  };

  const footerContinue = (() => {
    if (!activeStep || isReadOnly) {
      return null;
    }
    switch (activeStep) {
      case "business_identity":
        return (
          <Button
            type="submit"
            form="onboarding-business-identity-form"
            disabled={pending.isSavingBusinessProfile}
            aria-busy={pending.isSavingBusinessProfile}
          >
            {pending.isSavingBusinessProfile ? "Saving…" : "Save & continue"}
          </Button>
        );
      case "business_program":
        return (
          <Button
            type="submit"
            form="onboarding-business-program-form"
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

      {!showIntro && activeStep === "business_identity" ? (
        <OnboardingBusinessIdentityStep
          formId="onboarding-business-identity-form"
          onboarding={onboarding}
          isReadOnly={isReadOnly}
          pending={pending}
        />
      ) : null}

      {!showIntro && activeStep === "business_program" ? (
        <OnboardingBusinessProgramStep
          formId="onboarding-business-program-form"
          onboarding={onboarding}
          isReadOnly={isReadOnly}
          pending={pending}
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
          actionHref={checklistCreateHref(workspaceId, "audiences/new", "audience")}
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
          pending={pending}
          validationRequest={actionData?.validationRequest}
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
          actionHref={checklistCreateHref(workspaceId, "scripts/new", "script")}
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
          actionHref={checklistCreateHref(workspaceId, "campaigns/new", "campaign_info")}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
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
