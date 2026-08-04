import { Form } from "react-router";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionHeader } from "@/components/shared/Section";
import type { OnboardingStepProps } from "./types";
import { useRequiredBusinessProfileFields } from "./useRequiredBusinessProfileFields";

type Props = Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
};

/**
 * SMS-only program details (#1106/#1076): strip to fields carriers need that
 * lack a sensible default — use-case summary and sample messages.
 */
export function OnboardingBusinessProgramStep({
  formId = "onboarding-business-program-form",
  onboarding,
  isReadOnly,
}: Props) {
  const { requiredFieldProps, requiredFieldError } =
    useRequiredBusinessProfileFields();

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="SMS program details"
        description="Carriers review these when approving bulk texting. Keep them short and specific to how people opt in."
      />
      <Form id={formId} method="post" className="max-w-xl space-y-6">
        <input type="hidden" name="_action" value="save_business_profile" />
        <input type="hidden" name="wizardStep" value="business_program" />
        <div className="grid gap-4">
          <FormField
            htmlFor="useCaseSummary"
            label="What will you text about?"
            required
            error={requiredFieldError("useCaseSummary")}
          >
            <Textarea
              id="useCaseSummary"
              name="useCaseSummary"
              placeholder="Example: Appointment reminders for patients who opt in when they book online."
              defaultValue={onboarding.businessProfile.useCaseSummary}
              disabled={isReadOnly}
              {...requiredFieldProps<HTMLTextAreaElement>("useCaseSummary")}
            />
          </FormField>
          <FormField
            htmlFor="sampleMessages"
            label="Sample messages"
            required
            error={requiredFieldError("sampleMessages")}
          >
            <Textarea
              id="sampleMessages"
              name="sampleMessages"
              placeholder={`Acme Health: Your appointment is tomorrow at 9:30 AM. Reply STOP to opt out.\nAcme Health: Your prescription is ready for pickup.`}
              defaultValue={onboarding.businessProfile.sampleMessages.join("\n")}
              disabled={isReadOnly}
              {...requiredFieldProps<HTMLTextAreaElement>("sampleMessages")}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              One example per line. Include your business name and an opt-out line.
            </p>
          </FormField>
        </div>
      </Form>
    </Section>
  );
}
