import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Section, SectionHeader } from "@/components/shared/Section";
import { formatCredits } from "@/lib/billing-format";
import {
  countRentedWorkspaceNumbers,
  countVerifiedCallerIdNumbers,
  workspaceHasFirstNumber,
} from "@/lib/messaging-onboarding/predicates";
import { wizardStepsForGoal } from "@/lib/messaging-onboarding/goals";
import { productGoalForOnboardingGoal } from "@/lib/campaign-goals";
import { WIZARD_STEP_META } from "./constants";
import type { OnboardingStepProps } from "./types";

function formatPhoneNumberBadge(
  rentedCount: number,
  verifiedCallerIdCount: number,
): string {
  if (rentedCount > 0 && verifiedCallerIdCount > 0) {
    return `${rentedCount} rented, ${verifiedCallerIdCount} verified`;
  }
  if (rentedCount > 0) {
    return `${rentedCount} rented number${rentedCount === 1 ? "" : "s"}`;
  }
  if (verifiedCallerIdCount > 0) {
    return `${verifiedCallerIdCount} verified number${verifiedCallerIdCount === 1 ? "" : "s"}`;
  }
  return "Phone number pending";
}

type OnboardingLaunchStepProps = Pick<
  OnboardingStepProps,
  "onboarding" | "readiness" | "workspaceId" | "phoneNumbers"
> & {
  audienceCount: number;
  campaignCount: number;
  scriptCount: number;
  creditsBalance: number;
};

export function OnboardingLaunchStep({
  onboarding,
  readiness,
  workspaceId,
  phoneNumbers,
  audienceCount,
  campaignCount,
  scriptCount,
  creditsBalance,
}: OnboardingLaunchStepProps) {
  const numbers = phoneNumbers ?? [];
  const rentedCount = countRentedWorkspaceNumbers(numbers);
  const verifiedCallerIdCount = countVerifiedCallerIdNumbers(numbers);
  const hasFirstNumber = workspaceHasFirstNumber(numbers);
  const visibleStepIds = new Set(wizardStepsForGoal(onboarding.selectedGoal));
  const campaignGoal = onboarding.selectedGoal
    ? productGoalForOnboardingGoal(onboarding.selectedGoal)
    : null;

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="Ready to launch"
        description="Review your setup progress, then open the workspace to start your campaign."
      />
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={hasFirstNumber ? "secondary" : "outline"}>
            {formatPhoneNumberBadge(rentedCount, verifiedCallerIdCount)}
          </Badge>
          <Badge variant={audienceCount > 0 ? "secondary" : "outline"}>
            {audienceCount > 0
              ? `${audienceCount} audience${audienceCount === 1 ? "" : "s"}`
              : "Audience pending"}
          </Badge>
          {visibleStepIds.has("script") ? (
            <Badge variant={scriptCount > 0 ? "secondary" : "outline"}>
              {scriptCount > 0
                ? `${scriptCount} script${scriptCount === 1 ? "" : "s"}`
                : "Script pending"}
            </Badge>
          ) : null}
          <Badge variant={campaignCount > 0 ? "secondary" : "outline"}>
            {campaignCount > 0
              ? `${campaignCount} campaign${campaignCount === 1 ? "" : "s"}`
              : "Campaign pending"}
          </Badge>
          <Badge variant={creditsBalance > 0 ? "secondary" : "outline"}>
            {creditsBalance > 0
              ? `${formatCredits(creditsBalance)} credits`
              : "0 credits"}
          </Badge>
        </div>
        {readiness.warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {readiness.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            This workspace meets the current readiness checks for launch.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {onboarding.steps
            .filter((step) => visibleStepIds.has(step.id as never))
            .map((step) => {
              const meta = WIZARD_STEP_META.find((item) => item.id === step.id);
              return (
                <div key={step.id} className="rounded-md bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{meta?.label ?? step.label}</span>
                    <StatusBadge status={step.status} />
                  </div>
                </div>
              );
            })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/workspaces/${workspaceId}`}>Go to workspace</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              to={`/workspaces/${workspaceId}/campaigns/new${
                campaignGoal ? `?goal=${encodeURIComponent(campaignGoal)}` : ""
              }`}
            >
              Create campaign
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/workspaces/${workspaceId}/settings/numbers`}>Manage numbers</Link>
          </Button>
        </div>
      </div>
    </Section>
  );
}
