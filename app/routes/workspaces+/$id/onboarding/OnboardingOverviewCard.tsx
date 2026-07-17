import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { WizardOnboardingStepId } from "@/lib/messaging-onboarding/wizard-steps";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { WIZARD_STEP_META } from "./constants";

type OnboardingOverviewCardProps = {
  onboarding: WorkspaceMessagingOnboardingState;
  workspaceName: string;
  workspaceId: string;
  creditsBalance: number;
  activeStep: WizardOnboardingStepId;
  visibleSteps: WizardOnboardingStepId[];
  stepIndex: number;
  progressValue: number;
};

export function OnboardingOverviewCard({
  onboarding,
  workspaceName,
  workspaceId,
  creditsBalance,
  activeStep,
  visibleSteps,
  stepIndex,
  progressValue,
}: OnboardingOverviewCardProps) {
  const activeMeta = WIZARD_STEP_META.find((step) => step.id === activeStep);

  return (
    <Card data-testid="onboarding-step">
      <CardHeader className="space-y-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">Setup: {workspaceName}</CardTitle>
          <CardDescription>
            Step {stepIndex + 1} of {visibleSteps.length} — {activeMeta?.label ?? "Onboarding"}
          </CardDescription>
        </div>
        <Progress value={progressValue} className="h-2" />
        <div className="flex flex-wrap gap-1.5">
          {visibleSteps.map((stepId, index) => {
            const meta = WIZARD_STEP_META.find((step) => step.id === stepId);
            const stored = onboarding.steps.find((item) => item.id === stepId);
            const isActive = stepId === activeStep;
            const isComplete = stored?.status === "complete";
            return (
              <Badge
                key={stepId}
                variant={isActive ? "default" : isComplete ? "secondary" : "outline"}
                className="text-xs"
              >
                {index + 1}. {meta?.shortLabel ?? stepId}
              </Badge>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            Credits:{" "}
            <strong className="text-foreground tabular-nums">
              {creditsBalance.toLocaleString()}
            </strong>
          </span>
          <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
            <Link to={`/workspaces/${workspaceId}/billing`}>Add credits</Link>
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
