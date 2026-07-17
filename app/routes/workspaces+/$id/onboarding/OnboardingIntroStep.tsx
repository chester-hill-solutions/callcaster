import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WIZARD_STEP_META } from "./constants";

type OnboardingIntroStepProps = {
  workspaceName: string;
  onStart: () => void;
};

const INTRO_STEPS = WIZARD_STEP_META.filter((step) =>
  ["business_profile", "path_selection", "audience", "first_number", "script", "campaign_info", "credits"].includes(
    step.id,
  ),
);

export function OnboardingIntroStep({ workspaceName, onStart }: OnboardingIntroStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up {workspaceName}</CardTitle>
        <CardDescription>
          A short walkthrough to get you ready for a live call session, IVR, or SMS blast.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="space-y-3 text-sm text-muted-foreground">
          {INTRO_STEPS.map((step, index) => (
            <li key={step.id} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-foreground">
                {index + 1}
              </span>
              <span>
                <span className="font-medium text-foreground">{step.label}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Each step serves the goal you pick. You can continue past a step and finish it later from
          Settings.
        </div>
        <Button type="button" onClick={onStart}>
          Start setup
        </Button>
      </CardContent>
    </Card>
  );
}
