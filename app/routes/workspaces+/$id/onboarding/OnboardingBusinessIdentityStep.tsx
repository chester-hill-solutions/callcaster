import { Form } from "react-router";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section, SectionHeader } from "@/components/shared/Section";
import { goalNeedsSmsCompliance } from "@/lib/messaging-onboarding/goals";
import { OPERATING_COUNTRY_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";
import { useRequiredBusinessProfileFields } from "./useRequiredBusinessProfileFields";

type Props = Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
};

/**
 * Bare-bones identity (#1105): only what every goal needs — legal name, website,
 * and operating country (drives SMS channel selection).
 */
export function OnboardingBusinessIdentityStep({
  formId = "onboarding-business-identity-form",
  onboarding,
  isReadOnly,
}: Props) {
  const { requiredFieldProps, requiredFieldError } =
    useRequiredBusinessProfileFields();
  // Website URL is only required when the goal will send SMS — carriers ask
  // for it during 10DLC / toll-free registration. All other goals (voice
  // dialers, IVR) don't need it, so it's optional there and the label
  // shouldn't render a red asterisk (#1311).
  const websiteRequired = goalNeedsSmsCompliance(onboarding.selectedGoal);

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="Business identity"
        description="Just the basics for now. Compliance details can be filled in when a channel needs them."
      />
      <Form id={formId} method="post" className="max-w-xl space-y-6">
        <input type="hidden" name="_action" value="save_business_profile" />
        <input type="hidden" name="wizardStep" value="business_identity" />
        <div className="grid gap-4">
          <FormField
            htmlFor="legalBusinessName"
            label="Legal business name"
            required
            error={requiredFieldError("legalBusinessName")}
          >
            <Input
              id="legalBusinessName"
              name="legalBusinessName"
              placeholder="Acme Health Services LLC"
              defaultValue={onboarding.businessProfile.legalBusinessName}
              disabled={isReadOnly}
              {...requiredFieldProps<HTMLInputElement>("legalBusinessName")}
            />
          </FormField>
          <FormField
            htmlFor="websiteUrl"
            label="Website URL"
            required={websiteRequired}
            description={
              websiteRequired
                ? "Required — carriers ask for it during SMS registration."
                : "Optional. Only required later if you switch to a goal that sends SMS."
            }
            error={requiredFieldError("websiteUrl", { required: websiteRequired })}
          >
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              placeholder="https://www.acmehealth.com"
              defaultValue={onboarding.businessProfile.websiteUrl}
              disabled={isReadOnly}
              {...requiredFieldProps<HTMLInputElement>("websiteUrl", {
                required: websiteRequired,
              })}
            />
          </FormField>
          <FormField htmlFor="operatingCountry" label="Operating country">
            <select
              id="operatingCountry"
              name="operatingCountry"
              defaultValue={onboarding.operatingCountry}
              disabled={isReadOnly}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {OPERATING_COUNTRY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
      </Form>
    </Section>
  );
}
