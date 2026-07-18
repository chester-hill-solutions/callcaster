import { Form } from "react-router";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Section, SectionHeader } from "@/components/shared/Section";
import { OPERATING_COUNTRY_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";
import { useRequiredBusinessProfileFields } from "./useRequiredBusinessProfileFields";

type Props = Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
};

export function OnboardingBusinessIdentityStep({
  formId = "onboarding-business-identity-form",
  onboarding,
  isReadOnly,
}: Props) {
  const { requiredFieldProps, requiredFieldError } =
    useRequiredBusinessProfileFields();

  return (
    <Section variant="flat">
      <SectionHeader compact title="Business identity" />
      <Form id={formId} method="post" className="space-y-6">
        <input type="hidden" name="_action" value="save_business_profile" />
        <input type="hidden" name="wizardStep" value="business_identity" />
        <div className="grid gap-4 md:grid-cols-2">
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
          <FormField htmlFor="businessType" label="Business type">
            <Input
              id="businessType"
              name="businessType"
              placeholder="LLC"
              defaultValue={onboarding.businessProfile.businessType}
              disabled={isReadOnly}
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
          <FormField
            htmlFor="websiteUrl"
            label="Website URL"
            required
            error={requiredFieldError("websiteUrl")}
          >
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              placeholder="https://www.acmehealth.com"
              defaultValue={onboarding.businessProfile.websiteUrl}
              disabled={isReadOnly}
              {...requiredFieldProps<HTMLInputElement>("websiteUrl")}
            />
          </FormField>
          <FormField htmlFor="privacyPolicyUrl" label="Privacy policy URL">
            <Input
              id="privacyPolicyUrl"
              name="privacyPolicyUrl"
              type="url"
              placeholder="https://www.acmehealth.com/privacy"
              defaultValue={onboarding.businessProfile.privacyPolicyUrl}
              disabled={isReadOnly}
            />
          </FormField>
          <FormField htmlFor="termsOfServiceUrl" label="Terms of service URL">
            <Input
              id="termsOfServiceUrl"
              name="termsOfServiceUrl"
              type="url"
              placeholder="https://www.acmehealth.com/terms"
              defaultValue={onboarding.businessProfile.termsOfServiceUrl}
              disabled={isReadOnly}
            />
          </FormField>
          <FormField htmlFor="supportEmail" label="Support email">
            <Input
              id="supportEmail"
              name="supportEmail"
              type="email"
              placeholder="support@acmehealth.com"
              defaultValue={onboarding.businessProfile.supportEmail}
              disabled={isReadOnly}
            />
          </FormField>
          <FormField htmlFor="supportPhone" label="Support phone">
            <Input
              id="supportPhone"
              name="supportPhone"
              placeholder="+1 415 555 0100"
              defaultValue={onboarding.businessProfile.supportPhone}
              disabled={isReadOnly}
            />
          </FormField>
        </div>
      </Form>
    </Section>
  );
}
