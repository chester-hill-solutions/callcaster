import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NumberRentalCreditsAlert } from "@/components/phone-numbers/NumberRentalCreditsAlert";
import { hasCreditsForNumberRental, NUMBER_RENTAL_MONTHLY_CREDITS } from "@/lib/number-rental";
import { WIZARD_STEP_META } from "./constants";

type OnboardingIntroStepProps = {
  workspaceName: string;
  workspaceId: string;
  creditsBalance: number;
  onStart: () => void;
};

export function OnboardingIntroStep({
  workspaceName,
  workspaceId,
  creditsBalance,
  onStart,
}: OnboardingIntroStepProps) {
  const needsCredits = !hasCreditsForNumberRental(creditsBalance);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up {workspaceName}</CardTitle>
        <CardDescription>
          We will walk you through messaging compliance, your first phone number, and provider
          registration step by step. Most teams finish the essentials in a few minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="space-y-3 text-sm text-muted-foreground">
          {WIZARD_STEP_META.map((step, index) => (
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
          Write each answer as if a carrier reviewer has never seen your business before. Use plain
          language, avoid internal shorthand, and be specific about what customers sign up for.
        </div>
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          If you plan to rent a Canadian number, budget{" "}
          <strong>{NUMBER_RENTAL_MONTHLY_CREDITS.toLocaleString()} credits</strong> for each 30-day
          rental period. Verifying your own number does not use credits.
        </div>
        {needsCredits ? (
          <NumberRentalCreditsAlert
            creditsBalance={creditsBalance}
            billingLink={`/workspaces/${workspaceId}/billing`}
            title="Add credits before you rent a number"
          />
        ) : null}
        <Button type="button" onClick={onStart}>
          Start setup
        </Button>
      </CardContent>
    </Card>
  );
}
