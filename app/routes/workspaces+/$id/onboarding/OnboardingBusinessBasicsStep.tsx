import { useState } from "react";
import { Form } from "react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionHeader } from "@/components/shared/Section";
import type { Tables } from "@/lib/db-types";
import {
  businessProfileFieldRequiredMessage,
  type BusinessProfileFieldKey,
} from "@/lib/messaging-onboarding/predicates";
import { OPERATING_COUNTRY_OPTIONS } from "./constants";
import type { OnboardingPendingActions, OnboardingStepProps } from "./types";

type OnboardingBusinessBasicsStepProps = Pick<
  OnboardingStepProps,
  "onboarding" | "isReadOnly" | "pending"
> & {
  formId?: string;
  voiceCapableWorkspaceNumbers: Tables<"workspace_number">[];
  emergencyEligibleNumbers: Set<string>;
};

export function OnboardingBusinessBasicsStep({
  formId = "onboarding-business-form",
  onboarding,
  isReadOnly,
  pending,
  voiceCapableWorkspaceNumbers,
  emergencyEligibleNumbers,
}: OnboardingBusinessBasicsStepProps) {
  const { isSavingBusinessProfile, isReviewingEmergencyVoice } = pending;
  const [missingFields, setMissingFields] = useState<
    Partial<Record<BusinessProfileFieldKey, boolean>>
  >({});

  const markMissing = (field: BusinessProfileFieldKey, missing: boolean) => {
    setMissingFields((current) =>
      current[field] === missing ? current : { ...current, [field]: missing },
    );
  };

  /**
   * Shared wiring for the baseline-required fields: native constraint validation
   * blocks the submit, and `onInvalid` turns the browser's bubble into the
   * repo's inline FormField error. The action re-checks server-side regardless.
   */
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
      <SectionHeader
        compact
        title="Business basics"
        description="Share the business identity and contact details used across live calls, IVR, and SMS."
      />
      <Form id={formId} method="post" className="space-y-6">
          <input type="hidden" name="_action" value="save_business_profile" />
          <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
            Use the registered business name, a public website, and clear examples of what contacts
            will hear or receive.
          </div>

          <div className="space-y-4 border-t border-border/60 pt-6">
            <div>
              <div className="font-medium">Business identity</div>
              <p className="mt-1 text-sm text-muted-foreground">
                This is the basic profile a reviewer uses to understand who this workspace represents.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                htmlFor="legalBusinessName"
                label="Legal business name"
                required
                description="Use the registered company name, not an internal project name or nickname."
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
              <div className="space-y-2">
                <Label htmlFor="businessType">Business type</Label>
                <p className="text-xs text-muted-foreground">
                  Examples: LLC, corporation, nonprofit, sole proprietor, government agency.
                </p>
                <Input
                  id="businessType"
                  name="businessType"
                  placeholder="LLC"
                  defaultValue={onboarding.businessProfile.businessType}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="operatingCountry">Operating country</Label>
                <p className="text-xs text-muted-foreground">
                  Where does this workspace send messages and calls? Canada-only
                  programs skip US A2P 10DLC registration.
                </p>
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
              </div>
              <FormField
                htmlFor="websiteUrl"
                label="Website URL"
                required
                description="Link the public site that shows the business, brand, or program customers will recognize."
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
              <div className="space-y-2">
                <Label htmlFor="privacyPolicyUrl">Privacy policy URL</Label>
                <p className="text-xs text-muted-foreground">
                  Use the exact page that explains how customer data and phone numbers are handled.
                </p>
                <Input
                  id="privacyPolicyUrl"
                  name="privacyPolicyUrl"
                  type="url"
                  placeholder="https://www.acmehealth.com/privacy"
                  defaultValue={onboarding.businessProfile.privacyPolicyUrl}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="termsOfServiceUrl">Terms of service URL</Label>
                <p className="text-xs text-muted-foreground">
                  Link the page customers agree to when they use this service or program.
                </p>
                <Input
                  id="termsOfServiceUrl"
                  name="termsOfServiceUrl"
                  type="url"
                  placeholder="https://www.acmehealth.com/terms"
                  defaultValue={onboarding.businessProfile.termsOfServiceUrl}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportEmail">Support email</Label>
                <p className="text-xs text-muted-foreground">
                  Give customers a real contact address they can use if they have questions.
                </p>
                <Input
                  id="supportEmail"
                  name="supportEmail"
                  type="email"
                  placeholder="support@acmehealth.com"
                  defaultValue={onboarding.businessProfile.supportEmail}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportPhone">Support phone</Label>
                <p className="text-xs text-muted-foreground">
                  Use a monitored support line, not a personal number.
                </p>
                <Input
                  id="supportPhone"
                  name="supportPhone"
                  placeholder="+1 415 555 0100"
                  defaultValue={onboarding.businessProfile.supportPhone}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-border/60 pt-6">
            <div>
              <div className="font-medium">Messaging program details</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe the messages plainly enough that someone outside the team can tell what users signed up to receive.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                className="md:col-span-2"
                htmlFor="useCaseSummary"
                label="Use case summary"
                required
                description="Summarize the program in 2-4 sentences. Mention who receives the messages and why."
                error={requiredFieldError("useCaseSummary")}
              >
                <Textarea
                  id="useCaseSummary"
                  name="useCaseSummary"
                  placeholder="We send appointment reminders and follow-up confirmations to patients who request updates during scheduling."
                  defaultValue={onboarding.businessProfile.useCaseSummary}
                  disabled={isReadOnly}
                  {...requiredFieldProps<HTMLTextAreaElement>("useCaseSummary")}
                />
              </FormField>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="optInWorkflow">Opt-in workflow</Label>
                <p className="text-xs text-muted-foreground">
                  Explain exactly how someone gives consent. Mention the form, checkbox, keyword, or signup flow they complete.
                </p>
                <Textarea
                  id="optInWorkflow"
                  name="optInWorkflow"
                  placeholder="Patients opt in during online booking with an unchecked consent box that explains they will receive appointment text reminders."
                  defaultValue={onboarding.businessProfile.optInWorkflow}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="optInKeywords">Opt-in keywords</Label>
                <p className="text-xs text-muted-foreground">
                  If people can join by text, list the keywords here. Leave blank if signup happens elsewhere.
                </p>
                <Input
                  id="optInKeywords"
                  name="optInKeywords"
                  placeholder="START, JOIN"
                  defaultValue={onboarding.businessProfile.optInKeywords}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="optOutKeywords">Opt-out keywords</Label>
                <p className="text-xs text-muted-foreground">
                  Common examples are STOP or UNSUBSCRIBE. List what your program supports.
                </p>
                <Input
                  id="optOutKeywords"
                  name="optOutKeywords"
                  placeholder="STOP, UNSUBSCRIBE"
                  defaultValue={onboarding.businessProfile.optOutKeywords}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="helpKeywords">Help keywords</Label>
                <p className="text-xs text-muted-foreground">
                  If customers can text for help, list those keywords too.
                </p>
                <Input
                  id="helpKeywords"
                  name="helpKeywords"
                  placeholder="HELP"
                  defaultValue={onboarding.businessProfile.helpKeywords}
                  disabled={isReadOnly}
                />
              </div>
              <FormField
                className="md:col-span-2"
                htmlFor="sampleMessages"
                label="Sample messages"
                required
                description="Enter one real example per line. Include the actual tone and content users will receive."
                error={requiredFieldError("sampleMessages")}
              >
                <Textarea
                  id="sampleMessages"
                  name="sampleMessages"
                  placeholder={`Acme Health: Your appointment with Dr. Lee is tomorrow at 9:30 AM. Reply C to confirm or STOP to opt out.\nAcme Health: Your prescription is ready for pickup at our Market Street location.`}
                  defaultValue={onboarding.businessProfile.sampleMessages.join("\n")}
                  disabled={isReadOnly}
                  {...requiredFieldProps<HTMLTextAreaElement>("sampleMessages")}
                />
              </FormField>
            </div>
          </div>

          <div className="space-y-4 border-t border-border/60 pt-6">
            <div>
              <div className="font-medium">Emergency voice address</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Fill this out if the workspace needs voice emergency compliance. Use a real physical service address, not a PO box.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="addressStreet">Street address</Label>
                <Input
                  id="addressStreet"
                  name="addressStreet"
                  placeholder="123 Main St"
                  defaultValue={onboarding.emergencyVoice.address.street}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressCity">City</Label>
                <Input
                  id="addressCity"
                  name="addressCity"
                  placeholder="Toronto"
                  defaultValue={onboarding.emergencyVoice.address.city}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressRegion">Province or region</Label>
                <Input
                  id="addressRegion"
                  name="addressRegion"
                  placeholder="ON"
                  defaultValue={onboarding.emergencyVoice.address.region}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressPostalCode">Postal code</Label>
                <Input
                  id="addressPostalCode"
                  name="addressPostalCode"
                  placeholder="M5V 2T6"
                  defaultValue={onboarding.emergencyVoice.address.postalCode}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressCountryCode">Country code</Label>
                <Input
                  id="addressCountryCode"
                  name="addressCountryCode"
                  placeholder="CA"
                  defaultValue={onboarding.emergencyVoice.address.countryCode}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>
          {!isReadOnly ? (
            <Button type="submit" disabled={isSavingBusinessProfile} aria-busy={isSavingBusinessProfile}>
              {isSavingBusinessProfile ? "Saving business details..." : "Save business details"}
            </Button>
          ) : null}
        </Form>
        {onboarding.selectedChannels.includes("voice_compliance") ? (
          <div className="mt-6 space-y-4 border-t border-border/60 pt-6">
            <div>
              <div className="font-medium">Emergency voice review</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Validate the saved service address and reconcile existing rented voice numbers after the address is saved.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Address status</div>
                <div className="mt-1 font-medium capitalize">
                  {onboarding.emergencyVoice.address.status.replaceAll("_", " ")}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Emergency-ready numbers</div>
                <div className="mt-1 font-medium">{onboarding.emergencyVoice.emergencyEligiblePhoneNumbers.length}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Last reviewed</div>
                <div className="mt-1 font-medium">
                  {onboarding.emergencyVoice.lastReviewedAt
                    ? new Date(onboarding.emergencyVoice.lastReviewedAt).toLocaleString()
                    : "Not reviewed yet"}
                </div>
              </div>
            </div>
            {onboarding.emergencyVoice.address.validationError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {onboarding.emergencyVoice.address.validationError}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <div className="text-sm font-medium">Workspace rented voice numbers</div>
              {voiceCapableWorkspaceNumbers.length > 0 ? (
                <div className="space-y-2">
                  {voiceCapableWorkspaceNumbers.map((number) => (
                    <div
                      key={number.id ?? number.phone_number ?? "workspace-number"}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="font-mono">{number.phone_number}</span>
                      <Badge
                        variant={
                          emergencyEligibleNumbers.has(number.phone_number ?? "") ? "secondary" : "outline"
                        }
                      >
                        {emergencyEligibleNumbers.has(number.phone_number ?? "")
                          ? "Emergency ready"
                          : "Needs review"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No rented voice-capable workspace numbers are available yet.
                </p>
              )}
            </div>
            {!isReadOnly ? (
              <Form method="post">
                <input type="hidden" name="_action" value="review_emergency_voice" />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={isReviewingEmergencyVoice}
                  aria-busy={isReviewingEmergencyVoice}
                >
                  {isReviewingEmergencyVoice
                    ? "Reviewing emergency voice..."
                    : "Validate address and review numbers"}
                </Button>
              </Form>
            ) : null}
          </div>
        ) : null}
    </Section>
  );
}
