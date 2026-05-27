import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CampaignSetupStep } from "@/lib/campaign-setup-steps";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";

type CampaignSetupGuideProps = {
  steps: CampaignSetupStep[];
  currentStepNumber: number;
  totalSteps: number;
  allComplete: boolean;
  onDismiss: () => void;
  onStartCampaign?: () => void;
};

function StepStatusIcon({ status }: { status: CampaignSetupStep["status"] }) {
  if (status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
  }
  if (status === "current") {
    return <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />;
  }
  return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

function StepActionButton({
  action,
}: {
  action: NonNullable<CampaignSetupStep["action"]>;
}) {
  if (action.type === "scroll") {
    return (
      <Button
        type="button"
        onClick={() => {
          document.getElementById(action.targetId)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }}
      >
        {action.label}
      </Button>
    );
  }

  return (
    <Button asChild>
      <Link to={action.href}>{action.label}</Link>
    </Button>
  );
}

export function CampaignSetupGuide({
  steps,
  currentStepNumber,
  totalSteps,
  allComplete,
  onDismiss,
  onStartCampaign,
}: CampaignSetupGuideProps) {
  const currentStep = steps.find((step) => step.status === "current");

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Set up your first campaign</CardTitle>
            <CardDescription>
              {allComplete
                ? "You're ready to launch. Save any changes, then start your campaign."
                : `Step ${currentStepNumber} of ${totalSteps} — complete each step below to get started.`}
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss guide
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentStep ? (
          <div className="rounded-lg border bg-background p-4">
            <div className="mb-2 flex items-center gap-2">
              <StepStatusIcon status="current" />
              <h3 className="font-medium">{currentStep.label}</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              {currentStep.description}
            </p>
            {currentStep.action ? <StepActionButton action={currentStep.action} /> : null}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {steps
            .filter((step) => step.id !== "launch")
            .map((step) => (
              <div key={step.id} className="rounded-lg border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StepStatusIcon status={step.status} />
                    <span className="font-medium">{step.label}</span>
                  </div>
                  <Badge
                    variant={step.status === "complete" ? "secondary" : "outline"}
                  >
                    {step.status === "complete"
                      ? "Done"
                      : step.status === "current"
                        ? "Current"
                        : "Pending"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
        </div>

        {allComplete && onStartCampaign ? (
          <div className="flex justify-end">
            <Button type="button" onClick={onStartCampaign}>
              Start campaign
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
