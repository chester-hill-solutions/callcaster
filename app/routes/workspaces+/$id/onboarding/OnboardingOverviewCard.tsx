import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { NumberRentalCreditsAlert } from "@/components/phone-numbers/NumberRentalCreditsAlert";
import { hasCreditsForNumberRental } from "@/lib/number-rental";
import type { WizardOnboardingStepId } from "@/lib/messaging-onboarding.server";
import type {
  WorkspaceMessagingOnboardingState,
  WorkspaceMessagingReadiness,
} from "@/lib/types";
import { WIZARD_STEP_META } from "./constants";

type OnboardingOverviewCardProps = {
  onboarding: WorkspaceMessagingOnboardingState;
  readiness: WorkspaceMessagingReadiness;
  workspaceName: string;
  workspaceId: string;
  creditsBalance: number;
  activeStep: WizardOnboardingStepId;
  stepIndex: number;
  progressValue: number;
};

export function OnboardingOverviewCard({
  onboarding,
  readiness,
  workspaceName,
  workspaceId,
  creditsBalance,
  activeStep,
  stepIndex,
  progressValue,
}: OnboardingOverviewCardProps) {
  const activeMeta = WIZARD_STEP_META.find((step) => step.id === activeStep);
  const firstNumberComplete =
    onboarding.steps.find((step) => step.id === "first_number")?.status === "complete";
  const showCreditsPrompt =
    !firstNumberComplete && !hasCreditsForNumberRental(creditsBalance);

  return (
    <Card data-testid="onboarding-step">
      <CardHeader className="space-y-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">Setup: {workspaceName}</CardTitle>
          <CardDescription>
            Step {stepIndex + 1} of {WIZARD_STEP_META.length} — {activeMeta?.label ?? "Onboarding"}
          </CardDescription>
        </div>
        <Progress value={progressValue} className="h-2" />
        <div className="flex flex-wrap gap-1.5">
          {WIZARD_STEP_META.map((step, index) => {
            const stored = onboarding.steps.find((item) => item.id === step.id);
            const isActive = step.id === activeStep;
            const isComplete = stored?.status === "complete";
            return (
              <Badge
                key={step.id}
                variant={isActive ? "default" : isComplete ? "secondary" : "outline"}
                className="text-xs"
              >
                {index + 1}. {step.shortLabel}
              </Badge>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={readiness.messagingReady ? "secondary" : "outline"}>
            {readiness.messagingReady ? "Messaging ready" : "Messaging setup needed"}
          </Badge>
          <Badge variant={readiness.voiceReady ? "secondary" : "outline"}>
            {readiness.voiceReady ? "Voice ready" : "Voice compliance needed"}
          </Badge>
        </div>
      </CardHeader>
      {showCreditsPrompt ? (
        <CardContent className="space-y-4">
          <NumberRentalCreditsAlert
            creditsBalance={creditsBalance}
            billingLink={`/workspaces/${workspaceId}/billing`}
            title="Add credits before renting a number"
          />
        </CardContent>
      ) : null}
      {readiness.warnings.length > 0 ? (
        <CardContent className={showCreditsPrompt ? "pt-0" : undefined}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {readiness.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
