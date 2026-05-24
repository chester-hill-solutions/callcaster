import { Form } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/lib/database.types";
import type { OnboardingPendingActions, OnboardingStepProps } from "./types";

type OnboardingBusinessBasicsStepProps = Pick<
  OnboardingStepProps,
  "onboarding" | "isReadOnly" | "pending"
> & {
  voiceCapableWorkspaceNumbers: Tables<"workspace_number">[];
  emergencyEligibleNumbers: Set<string>;
};

export function OnboardingBusinessBasicsStep({
  onboarding,
  isReadOnly,
  pending,
  voiceCapableWorkspaceNumbers,
  emergencyEligibleNumbers,
}: OnboardingBusinessBasicsStepProps) {
  const { isSavingBusinessProfile, isReviewingEmergencyVoice } = pending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Business basics</CardTitle>
        <CardDescription>
          Start here. These answers explain who is sending messages and what the program does.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form method="post" className="space-y-6">
          <input type="hidden" name="_action" value="save_business_profile" />
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Good answers are concrete. For example: name the exact business entity, link the public pages customers can review, describe how someone opts in, and paste real example messages instead of placeholders.
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">Business identity</div>
              <p className="mt-1 text-sm text-muted-foreground">
                This is the basic profile a reviewer uses to understand who this workspace represents.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legalBusinessName">Legal business name</Label>
                <p className="text-xs text-muted-foreground">
                  Use the registered company name, not an internal project name or nickname.
                </p>
                <Input
                  id="legalBusinessName"
                  name="legalBusinessName"
                  placeholder="Acme Health Services LLC"
                  defaultValue={onboarding.businessProfile.legalBusinessName}
                  disabled={isReadOnly}
                />
              </div>
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
                <Label htmlFor="websiteUrl">Website URL</Label>
                <p className="text-xs text-muted-foreground">
                  Link the public site that shows the business, brand, or program customers will recognize.
                </p>
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  placeholder="https://www.acmehealth.com"
                  defaultValue={onboarding.businessProfile.websiteUrl}
                  disabled={isReadOnly}
                />
              </div>
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

          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">Messaging program details</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe the messages plainly enough that someone outside the team can tell what users signed up to receive.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="useCaseSummary">Use case summary</Label>
                <p className="text-xs text-muted-foreground">
                  Summarize the program in 2-4 sentences. Mention who receives the messages and why.
                </p>
                <Textarea
                  id="useCaseSummary"
                  name="useCaseSummary"
                  placeholder="We send appointment reminders and follow-up confirmations to patients who request updates during scheduling."
                  defaultValue={onboarding.businessProfile.useCaseSummary}
                  disabled={isReadOnly}
                />
              </div>
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
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sampleMessages">Sample messages</Label>
                <p className="text-xs text-muted-foreground">
                  Enter one real example per line. Include the actual tone and content users will receive.
                </p>
                <Textarea
                  id="sampleMessages"
                  name="sampleMessages"
                  placeholder={`Acme Health: Your appointment with Dr. Lee is tomorrow at 9:30 AM. Reply C to confirm or STOP to opt out.\nAcme Health: Your prescription is ready for pickup at our Market Street location.`}
                  defaultValue={onboarding.businessProfile.sampleMessages.join("\n")}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border p-4">
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
                  placeholder="San Francisco"
                  defaultValue={onboarding.emergencyVoice.address.city}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressRegion">State or region</Label>
                <Input
                  id="addressRegion"
                  name="addressRegion"
                  placeholder="CA"
                  defaultValue={onboarding.emergencyVoice.address.region}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressPostalCode">Postal code</Label>
                <Input
                  id="addressPostalCode"
                  name="addressPostalCode"
                  placeholder="94105"
                  defaultValue={onboarding.emergencyVoice.address.postalCode}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressCountryCode">Country code</Label>
                <Input
                  id="addressCountryCode"
                  name="addressCountryCode"
                  placeholder="US"
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
          <div className="mt-6 space-y-4 rounded-lg border p-4">
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
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                {onboarding.emergencyVoice.address.validationError}
              </div>
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
      </CardContent>
    </Card>
  );
}
