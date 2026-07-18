import { Link, useSearchParams } from "react-router";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { wizardStepsForGoal } from "@/lib/messaging-onboarding/goals";
import { isWizardOnboardingStepId } from "@/lib/messaging-onboarding/wizard-steps";
import { cn } from "@/lib/utils";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { WIZARD_STEP_META } from "./constants";
import { readWizardStep } from "./wizard-step-resolution";

export type OnboardingProgressStripProps = {
  onboarding: WorkspaceMessagingOnboardingState;
  workspaceId: string;
  workspaceName: string;
  creditsBalance: number;
};

/**
 * Route-level chrome for the onboarding wizard: setup title, step progress,
 * and credits, rendered directly beneath the navbar by the workspace layout.
 * The intro (naming) screen carries no `?step=` param, so the strip stays
 * hidden until the wizard proper begins.
 */
export function OnboardingProgressStrip({
  onboarding,
  workspaceId,
  workspaceName,
  creditsBalance,
}: OnboardingProgressStripProps) {
  const [searchParams] = useSearchParams();
  const urlStep = searchParams.get("step");
  if (!urlStep || !isWizardOnboardingStepId(urlStep)) {
    return null;
  }

  const visibleSteps = wizardStepsForGoal(onboarding.selectedGoal);
  const activeStep = readWizardStep(urlStep, onboarding.currentStep, visibleSteps);
  const stepIndex = visibleSteps.indexOf(activeStep);
  const activeMeta = WIZARD_STEP_META.find((step) => step.id === activeStep);
  const progressValue =
    stepIndex >= 0 ? ((stepIndex + 1) / visibleSteps.length) * 100 : 0;

  return (
    <div
      data-testid="onboarding-step"
      className="w-full border-b border-border/70 bg-background/95 px-4 py-3 sm:px-6"
    >
      <div className="flex w-full flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Setup: {workspaceName}</p>
          <p className="text-xs text-muted-foreground">
            Step {stepIndex + 1} of {visibleSteps.length} —{" "}
            {activeMeta?.label ?? "Onboarding"}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {visibleSteps.map((stepId, index) => {
            const meta = WIZARD_STEP_META.find((step) => step.id === stepId);
            const stored = onboarding.steps.find((item) => item.id === stepId);
            const isActive = stepId === activeStep;
            const isComplete = stored?.status === "complete";
            const variant = isActive ? "default" : isComplete ? "secondary" : "outline";
            return (
              <Link
                key={stepId}
                to={`?step=${encodeURIComponent(stepId)}`}
                replace
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  badgeVariants({ variant }),
                  "text-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {index + 1}. {meta?.shortLabel ?? stepId}
              </Link>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span>
            Credits:{" "}
            <strong className="tabular-nums text-foreground">
              {creditsBalance.toLocaleString()}
            </strong>
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
            <Link to={`/workspaces/${workspaceId}/billing`}>Add credits</Link>
          </Button>
        </div>
      </div>
      <Progress value={progressValue} className="mt-2 h-1.5" />
    </div>
  );
}
