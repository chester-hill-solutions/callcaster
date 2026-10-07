import { Link } from "react-router";
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
        description="Credits power calls, texts, and number rental."
      />
      <div className="space-y-3">
        <div className="flex max-w-md flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Current balance</div>
            <div className="text-lg font-semibold tabular-nums">
              {creditsBalance.toLocaleString()} credits
            </div>
          </div>
          <Button size="sm" asChild>
            <Link to={`/workspaces/${workspaceId}/billing`}>Add credits</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Number rental is about {NUMBER_RENTAL_MONTHLY_CREDITS.toLocaleString()} credits /
          30 days. You can add credits before launch.
        </p>
      </div>
    </Section>
  );
}
