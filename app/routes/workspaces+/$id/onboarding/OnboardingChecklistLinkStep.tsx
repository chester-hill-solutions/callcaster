import { Form, Link } from "react-router";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Section, SectionHeader } from "@/components/shared/Section";
import type { WizardOnboardingStepId } from "@/lib/messaging-onboarding/wizard-steps";

type OnboardingChecklistLinkStepProps = {
  title: string;
  description: string;
  complete: boolean;
  completeLabel: string;
  incompleteLabel: string;
  actionHref: string;
  actionLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  nextStep: WizardOnboardingStepId;
  skipLabel?: string;
  isReadOnly: boolean;
  helperText?: string;
};

export function OnboardingChecklistLinkStep({
  title,
  description,
  complete,
  completeLabel,
  incompleteLabel,
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel,
  nextStep,
  skipLabel = "Continue for now",
  isReadOnly,
  helperText,
}: OnboardingChecklistLinkStepProps) {
  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title={title}
        description={description}
        actions={<StatusBadge status={complete ? "complete" : "pending"} />}
      />
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {complete ? completeLabel : incompleteLabel}
        </p>
        {helperText ? (
          <p className="text-sm text-muted-foreground">{helperText}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={actionHref}>{actionLabel}</Link>
          </Button>
          {secondaryHref && secondaryLabel ? (
            <Button variant="outline" asChild>
              <Link to={secondaryHref}>{secondaryLabel}</Link>
            </Button>
          ) : null}
          {!isReadOnly ? (
            <Form method="post">
              <input type="hidden" name="_action" value="advance_step" />
              <input type="hidden" name="targetStep" value={nextStep} />
              <Button type="submit" variant="ghost">
                {complete ? "Continue" : skipLabel}
              </Button>
            </Form>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
