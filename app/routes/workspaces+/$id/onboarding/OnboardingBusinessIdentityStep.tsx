import { Form } from "react-router";
import { FormField, FormFieldControl } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionHeader } from "@/components/shared/Section";
import { goalNeedsSmsCompliance } from "@/lib/messaging-onboarding/goals";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { OPERATING_COUNTRY_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";
import { useRequiredBusinessProfileFields } from "./useRequiredBusinessProfileFields";

type Props = Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
};

type BusinessProfile = WorkspaceMessagingOnboardingState["businessProfile"];

type ProfileFieldsProps = {
  profile: BusinessProfile;
  isReadOnly: boolean;
};

function TollFreeVerificationFields({ profile, isReadOnly }: ProfileFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Toll-free verification details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Toll-free setup uses your CRA business number (BN). Carriers use it to
          approve higher-volume texting on a toll-free number.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField htmlFor="doingBusinessAs" label="Doing business as (DBA)">
          <FormFieldControl>
            <Input
              id="doingBusinessAs"
              name="doingBusinessAs"
              placeholder="Acme Health"
              defaultValue={profile.doingBusinessAs || profile.legalBusinessName}
              disabled={isReadOnly}
            />
          </FormFieldControl>
        </FormField>
        <FormField
          htmlFor="businessRegistrationNumber"
          label="Business registration number (BN)"
          required
          description="Use your CRA business number (9 digits + RC + account), from your CRA documents."
        >
          <FormFieldControl>
            <Input
              id="businessRegistrationNumber"
              name="businessRegistrationNumber"
              placeholder="123456789RC0001"
              defaultValue={profile.businessRegistrationNumber}
              disabled={isReadOnly}
              required
              aria-required
            />
          </FormFieldControl>
        </FormField>
      </div>
      <input type="hidden" name="ageGatedContent" value="false" />
      <FormField
        htmlFor="ageGatedContent"
        label="Age-gated content"
        description="Check this when messages include age-restricted content such as alcohol or gambling."
      >
        <FormFieldControl>
          <input
            id="ageGatedContent"
            type="checkbox"
            name="ageGatedContent"
            value="true"
            defaultChecked={profile.ageGatedContent}
            disabled={isReadOnly}
            className="size-4 rounded border border-input"
          />
        </FormFieldControl>
      </FormField>
      <FormField htmlFor="channelSampleMessages" label="Sample messages">
        <FormFieldControl>
          <Textarea
            id="channelSampleMessages"
            name="channelSampleMessages"
            placeholder={
              "One sample message per line.\nInclude opt-out language where relevant."
            }
            defaultValue={profile.sampleMessages.join("\n")}
            disabled={isReadOnly}
          />
        </FormFieldControl>
      </FormField>
    </div>
  );
}

function A2pRegistrationFields({ profile, isReadOnly }: ProfileFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">US brand registration details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Needed for application-to-person texting on US local numbers.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField htmlFor="ein" label="EIN (US tax ID)">
          <FormFieldControl>
            <Input
              id="ein"
              name="ein"
              placeholder="12-3456789"
              defaultValue={profile.ein}
              disabled={isReadOnly}
            />
          </FormFieldControl>
        </FormField>
        <FormField htmlFor="industry" label="Industry">
          <FormFieldControl>
            <Input
              id="industry"
              name="industry"
              placeholder="Healthcare"
              defaultValue={profile.industry}
              disabled={isReadOnly}
            />
          </FormFieldControl>
        </FormField>
        <FormField htmlFor="authorizedRepName" label="Authorized representative name">
          <FormFieldControl>
            <Input
              id="authorizedRepName"
              name="authorizedRepName"
              placeholder="Jordan Smith"
              defaultValue={profile.authorizedRepName}
              disabled={isReadOnly}
            />
          </FormFieldControl>
        </FormField>
        <FormField
          htmlFor="authorizedRepTitle"
          label="Authorized representative title"
        >
          <FormFieldControl>
            <Input
              id="authorizedRepTitle"
              name="authorizedRepTitle"
              placeholder="Head of Operations"
              defaultValue={profile.authorizedRepTitle}
              disabled={isReadOnly}
            />
          </FormFieldControl>
        </FormField>
        <FormField
          htmlFor="authorizedRepEmail"
          label="Authorized representative email"
        >
          <FormFieldControl>
            <Input
              id="authorizedRepEmail"
              name="authorizedRepEmail"
              type="email"
              placeholder="jordan@acmehealth.com"
              defaultValue={profile.authorizedRepEmail}
              disabled={isReadOnly}
            />
          </FormFieldControl>
        </FormField>
        <FormField
          htmlFor="authorizedRepPhone"
          label="Authorized representative phone"
        >
          <FormFieldControl>
            <Input
              id="authorizedRepPhone"
              name="authorizedRepPhone"
              placeholder="+1 555 123 4567"
              defaultValue={profile.authorizedRepPhone}
              disabled={isReadOnly}
            />
          </FormFieldControl>
        </FormField>
      </div>
    </div>
  );
}

/**
 * Collect the shared business identity, then the carrier identity fields for
 * the SMS channels selected on the Goal step.
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
  // shouldn't render a red asterisk.
  const websiteRequired = goalNeedsSmsCompliance(onboarding.selectedGoal);
  const showSmsIdentity = goalNeedsSmsCompliance(onboarding.selectedGoal);
  const showTollFreeFields =
    showSmsIdentity && onboarding.selectedChannels.includes("toll_free_bulk_sms");
  const showA2pFields =
    showSmsIdentity && onboarding.selectedChannels.includes("a2p10dlc");

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="Business identity"
        description={
          showSmsIdentity
            ? "Add your business details and the information carriers need for SMS."
            : "Add the basic information for your business."
        }
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
        {showTollFreeFields ? (
          <TollFreeVerificationFields
            profile={onboarding.businessProfile}
            isReadOnly={isReadOnly}
          />
        ) : null}
        {showA2pFields ? (
          <A2pRegistrationFields
            profile={onboarding.businessProfile}
            isReadOnly={isReadOnly}
          />
        ) : null}
      </Form>
    </Section>
  );
}
