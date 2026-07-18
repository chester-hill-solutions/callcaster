import { useState } from "react";
import { Form } from "react-router";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionHeader } from "@/components/shared/Section";
import {
  businessProfileFieldRequiredMessage,
  type BusinessProfileFieldKey,
} from "@/lib/messaging-onboarding/predicates";
import type { OnboardingStepProps } from "./types";

type Props = Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
};

export function OnboardingBusinessProgramStep({
  formId = "onboarding-business-program-form",
  onboarding,
  isReadOnly,
}: Props) {
  const [missingFields, setMissingFields] = useState<
    Partial<Record<BusinessProfileFieldKey, boolean>>
  >({});

  const markMissing = (field: BusinessProfileFieldKey, missing: boolean) => {
    setMissingFields((current) =>
      current[field] === missing ? current : { ...current, [field]: missing },
    );
  };

  const requiredFieldProps = <T extends HTMLInputElement | HTMLTextAreaElement>(
    field: BusinessProfileFieldKey,
  ) => ({
    required: true,
    "aria-invalid": missingFields[field] || undefined,
    onInvalid: (event: React.FormEvent<T>) => {
      event.preventDefault();
      markMissing(field, true);
    },
    onChange: (event: React.ChangeEvent<T>) => {
      if (event.target.value.trim()) {
        markMissing(field, false);
      }
    },
  });

  const requiredFieldError = (field: BusinessProfileFieldKey) =>
    missingFields[field] ? businessProfileFieldRequiredMessage(field) : undefined;

  return (
    <Section variant="flat">
      <SectionHeader compact title="Program details" />
      <Form id={formId} method="post" className="space-y-6">
        <input type="hidden" name="_action" value="save_business_profile" />
        <input type="hidden" name="wizardStep" value="business_program" />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            className="md:col-span-2"
            htmlFor="useCaseSummary"
            label="Use case summary"
            required
            error={requiredFieldError("useCaseSummary")}
          >
            <Textarea
              id="useCaseSummary"
              name="useCaseSummary"
              placeholder="Appointment reminders for patients who opt in during booking."
              defaultValue={onboarding.businessProfile.useCaseSummary}
              disabled={isReadOnly}
              {...requiredFieldProps<HTMLTextAreaElement>("useCaseSummary")}
            />
          </FormField>
          <FormField
            className="md:col-span-2"
            htmlFor="optInWorkflow"
            label="Opt-in workflow"
          >
            <Textarea
              id="optInWorkflow"
              name="optInWorkflow"
              placeholder="Unchecked consent box during online booking."
              defaultValue={onboarding.businessProfile.optInWorkflow}
              disabled={isReadOnly}
            />
          </FormField>
          <FormField htmlFor="optInKeywords" label="Opt-in keywords">
            <Input
              id="optInKeywords"
              name="optInKeywords"
              placeholder="START, JOIN"
              defaultValue={onboarding.businessProfile.optInKeywords}
              disabled={isReadOnly}
            />
          </FormField>
          <FormField htmlFor="optOutKeywords" label="Opt-out keywords">
            <Input
              id="optOutKeywords"
              name="optOutKeywords"
              placeholder="STOP, UNSUBSCRIBE"
              defaultValue={onboarding.businessProfile.optOutKeywords}
              disabled={isReadOnly}
            />
          </FormField>
          <FormField htmlFor="helpKeywords" label="Help keywords">
            <Input
              id="helpKeywords"
              name="helpKeywords"
              placeholder="HELP"
              defaultValue={onboarding.businessProfile.helpKeywords}
              disabled={isReadOnly}
            />
          </FormField>
          <FormField
            className="md:col-span-2"
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
          </FormField>
        </div>
      </Form>
    </Section>
  );
}
