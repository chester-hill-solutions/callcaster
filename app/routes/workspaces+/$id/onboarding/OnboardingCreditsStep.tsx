import { Form, Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "@/components/shared/Section";
import { NUMBER_RENTAL_MONTHLY_CREDITS } from "@/lib/number-rental";

type OnboardingCreditsStepProps = {
  workspaceId: string;
  creditsBalance: number;
  isReadOnly: boolean;
};

export function OnboardingCreditsStep({
  workspaceId,
  creditsBalance,
  isReadOnly,
}: OnboardingCreditsStepProps) {
  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="Credits"
        description="Credits power calls, texts, and phone number rental. Add some when you are ready to run outreach."
      />
      <div className="space-y-4">
        <div className="flex max-w-md flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Current balance</div>
            <div className="text-lg font-semibold tabular-nums">
              {creditsBalance.toLocaleString()} credits
            </div>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/workspaces/${workspaceId}/billing`}>Add credits</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Number rental uses about {NUMBER_RENTAL_MONTHLY_CREDITS.toLocaleString()} credits per
          30-day period. You can finish setup first and add credits before launching.
        </p>
        {!isReadOnly ? (
          <Form method="post">
            <input type="hidden" name="_action" value="advance_step" />
            <input type="hidden" name="targetStep" value="launch_checks" />
            <Button type="submit">Continue to review</Button>
          </Form>
        ) : null}
      </div>
    </Section>
  );
}
