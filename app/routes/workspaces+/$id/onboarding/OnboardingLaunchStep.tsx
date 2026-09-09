import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Section, SectionHeader } from "@/components/shared/Section";
import { buildWorkspaceLaunchChecklist } from "@/lib/workspace-launch-checklist";
import {
  BUSINESS_IDENTITY_REQUIRED_FIELDS,
  findMissingBusinessProfileFields,
} from "@/lib/messaging-onboarding/predicates";
import type { OnboardingStepProps } from "./types";

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
  const checklist = buildWorkspaceLaunchChecklist({
    workspaceId,
    onboarding,
    workspaceNumbers: phoneNumbers ?? [],
    audienceCount,
    campaignCount,
    scriptCount,
    creditsBalance,
  }).filter((item) => item.id !== "launch_review" && (
    onboarding.selectedGoal !== "rent_number" ||
    item.id === "goal" || item.id === "phone_number" || item.id === "credits"
  ));
  const items = [
    ...checklist.filter((item) => item.id === "goal"),
    {
      id: "business_identity",
      label: "Business identity",
      description: "Check the organization details used for this workspace.",
      complete: findMissingBusinessProfileFields(
        onboarding.businessProfile, BUSINESS_IDENTITY_REQUIRED_FIELDS,
      ).length === 0,
      href: `/workspaces/${workspaceId}/onboarding?step=business_identity`,
    },
    ...checklist.filter((item) => item.id !== "goal"),
  ];
  const nextItem = items.find((item) => !item.complete);
  const completeCount = items.filter((item) => item.complete).length;

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="Review your setup"
        description="See what is complete and choose your next step. You can return to setup from your workspace."
      />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">{completeCount} of {items.length} setup items complete</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {nextItem
                ? `Next: ${nextItem.label}.`
                : "Your setup checklist is complete. Check any notices below before you start."}
            </p>
          </div>
          <Button asChild>
            <Link to={nextItem?.href ?? `/workspaces/${workspaceId}`}>
              {nextItem ? "Continue setup" : "Go to workspace"}
            </Link>
          </Button>
        </div>

        {readiness.warnings.length > 0 ? (
          <section aria-labelledby="setup-notices" className="space-y-2 rounded-md bg-muted/40 p-4">
            <h3 id="setup-notices" className="text-sm font-medium">Before you start</h3>
            <p className="text-sm text-muted-foreground">
              These notices can affect calling or messaging even when the setup items are complete.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {readiness.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </section>
        ) : null}

        <ul aria-label="Setup checklist" className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col items-start justify-between gap-3 py-4 sm:flex-row sm:items-center">
              <div className="w-full min-w-0 sm:flex-1">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={item.complete ? "complete" : "pending"} label={item.complete ? "Complete" : "To do"} />
                <Button variant="outline" size="sm" asChild>
                  <Link to={item.href} aria-label={`${item.complete ? "Review" : "Set up"}: ${item.label}`}>
                    {item.complete ? "Review" : "Set up"}
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {onboarding.selectedGoal === "rent_number"
            ? "You can create a campaign later if you need one."
            : "Before launching, open your campaign and check its contacts, content, and sending settings."}
        </p>
        {nextItem ? (
          <Button variant="ghost" asChild>
            <Link to={`/workspaces/${workspaceId}`}>Go to workspace and finish later</Link>
          </Button>
        ) : null}
      </div>
    </Section>
  );
}
