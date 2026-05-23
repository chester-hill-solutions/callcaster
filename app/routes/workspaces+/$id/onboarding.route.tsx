export { loader } from "./onboarding.loader.server";
export { action } from "./onboarding.action.server";

import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingActionData } from "./onboarding.action.server";
import type { OnboardingLoaderData } from "./onboarding.loader.server";
import type { WorkspaceOnboardingChannel } from "@/lib/types";

const TWILIO_RCS_PROVIDER = "Twilio";
const TWILIO_RCS_DOCS_URL = "https://www.twilio.com/docs/rcs/onboarding";
const TWILIO_RCS_SENDERS_URL = "https://console.twilio.com/us1/develop/rcs/senders";

const CHANNEL_OPTIONS: Array<{
  id: WorkspaceOnboardingChannel;
  label: string;
  description: string;
}> = [
  {
    id: "a2p10dlc",
    label: "A2P 10DLC",
    description: "Register US application-to-person SMS campaigns and sender trust.",
  },
  {
    id: "rcs",
    label: "RCS for business",
    description: "Track rich-messaging readiness while the provider path matures.",
  },
  {
    id: "voice_compliance",
    label: "Voice emergency compliance",
    description: "Track emergency address and emergency-capable number readiness.",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasVoiceCapability(capabilities: unknown) {
  return isRecord(capabilities) && (capabilities.voice === true || capabilities.voice === "true");
}

export default function WorkspaceMessagingOnboardingRoute() {
  const { workspaceId, workspaceName, userRole, onboarding, readiness, phoneNumbers, rcsBlockingIssues } =
    useLoaderData<OnboardingLoaderData>();
  const actionData = useActionData<OnboardingActionData>();
  const navigation = useNavigation();

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.success) {
      toast.success(actionData.success);
    }
  }, [actionData]);

  const isReadOnly = userRole !== "owner" && userRole !== "admin";
  const pendingAction =
    navigation.state === "idle" ? null : String(navigation.formData?.get("_action") ?? "");
  const isSavingBusinessProfile = pendingAction === "save_business_profile";
  const isSavingChannels = pendingAction === "save_channels";
  const isBootstrappingMessagingService = pendingAction === "bootstrap_messaging_service";
  const isProvisioningA2P = pendingAction === "provision_a2p";
  const isSavingRcs = pendingAction === "save_rcs";
  const isReviewingEmergencyVoice = pendingAction === "review_emergency_voice";
  const a2pBlockingIssues = onboarding.reviewState.blockingIssues;
  const a2pErrors = [
    onboarding.a2p10dlc.rejectionReason,
    onboarding.reviewState.lastError,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  const emergencyEligibleNumbers = new Set(onboarding.emergencyVoice.emergencyEligiblePhoneNumbers);
  const voiceCapableWorkspaceNumbers = (phoneNumbers ?? []).filter(
    (number) => number?.phone_number && number.type === "rented" && hasVoiceCapability(number.capabilities),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Messaging onboarding for {workspaceName}</CardTitle>
          <CardDescription>
            Start with clear business details, then choose the channels and provider setup this workspace actually needs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={readiness.messagingReady ? "secondary" : "outline"}>
              {readiness.messagingReady ? "Messaging ready" : "Messaging setup needed"}
            </Badge>
            <Badge variant={readiness.voiceReady ? "secondary" : "outline"}>
              {readiness.voiceReady ? "Voice ready" : "Voice compliance needed"}
            </Badge>
            <Badge variant={readiness.legacyMode ? "outline" : "secondary"}>
              {readiness.legacyMode ? "Legacy compatibility mode" : "New workspace flow"}
            </Badge>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Write each answer as if a carrier reviewer has never seen your business before. Use plain language, avoid internal shorthand, and be specific about what customers sign up for.
          </div>
          {readiness.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              This workspace is aligned with the current onboarding readiness checks.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {onboarding.steps.map((step) => (
              <div key={step.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{step.label}</div>
                  <Badge variant={step.status === "complete" ? "secondary" : "outline"}>
                    {step.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {step.description ?? "No details yet."}
                </p>
              </div>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            Workspace numbers on file: {Array.isArray(phoneNumbers) ? phoneNumbers.length : 0}.{" "}
            <Link className="underline" to={`/workspaces/${workspaceId}/settings/numbers`}>
              Manage numbers
            </Link>
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>2. Choose channels</CardTitle>
          <CardDescription>
            After the business details are in place, choose which tracks we should prepare for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="save_channels" />
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Keep this focused. Only enable the channels or compliance tracks the workspace will actually use in the near term.
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {CHANNEL_OPTIONS.map((option) => (
                <div key={option.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <input
                      id={`channel-${option.id}`}
                      type="checkbox"
                      name="selectedChannels"
                      value={option.id}
                      defaultChecked={onboarding.selectedChannels.includes(option.id)}
                      disabled={isReadOnly}
                    />
                    <div>
                      <Label htmlFor={`channel-${option.id}`} className="font-medium">
                        {option.label}
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!isReadOnly ? (
              <Button type="submit" disabled={isSavingChannels} aria-busy={isSavingChannels}>
                {isSavingChannels ? "Saving channel selection..." : "Save channel selection"}
              </Button>
            ) : null}
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Messaging Service bootstrap</CardTitle>
          <CardDescription>
            Provision the shared Messaging Service used to send messages from this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            This step creates the shared Twilio messaging container that later registration and sender attachment will rely on.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Desired send mode</div>
              <div className="mt-1 font-medium">{onboarding.messagingService.desiredSendMode}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Messaging Service SID</div>
              <div className="mt-1 font-mono text-sm">
                {onboarding.messagingService.serviceSid ?? "Not provisioned yet"}
              </div>
            </div>
          </div>
          {!isReadOnly ? (
            <Form method="post">
              <input type="hidden" name="_action" value="bootstrap_messaging_service" />
              <Button
                type="submit"
                disabled={isBootstrappingMessagingService}
                aria-busy={isBootstrappingMessagingService}
              >
                {isBootstrappingMessagingService
                  ? "Provisioning Messaging Service..."
                  : "Provision Messaging Service"}
              </Button>
            </Form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Provider actions</CardTitle>
          <CardDescription>
            Start the provider steps after the business details and messaging setup above look correct.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">A2P 10DLC</div>
                <Badge
                  variant={
                    onboarding.a2p10dlc.status === "approved" || onboarding.a2p10dlc.status === "live"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {onboarding.a2p10dlc.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Brand SID: {onboarding.a2p10dlc.brandSid ?? "Not created"}.
                Campaign SID: {onboarding.a2p10dlc.campaignSid ?? "Not created"}.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                A2P 10DLC is primarily a US registration path for application-to-person SMS sent over US
                10-digit long-code numbers.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Canada-only messaging programs can usually leave this for later. It becomes valuable when
              you use US numbers, message US recipients, or want better US deliverability, throughput, and
              carrier trust before expanding there.
            </div>
            {a2pBlockingIssues.length > 0 ? (
              <div className="rounded-lg border p-4 text-sm">
                <div className="font-medium">A2P is currently blocked by missing prerequisites.</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {a2pBlockingIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {a2pErrors.length > 0 ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                <div className="font-medium">A2P needs attention</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {a2pErrors.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Current status</div>
                <div className="mt-1 font-medium capitalize">
                  {onboarding.a2p10dlc.status.replaceAll("_", " ")}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Brand registration</div>
                <div className="mt-1 font-mono text-sm">
                  {onboarding.a2p10dlc.brandSid ?? "Not created"}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Campaign registration</div>
                <div className="mt-1 font-mono text-sm">
                  {onboarding.a2p10dlc.campaignSid ?? "Not created"}
                </div>
              </div>
            </div>
            {!isReadOnly ? (
              <Form method="post">
                <input type="hidden" name="_action" value="provision_a2p" />
                <Button type="submit" disabled={isProvisioningA2P} aria-busy={isProvisioningA2P}>
                  {isProvisioningA2P ? "Provisioning A2P resources..." : "Provision A2P resources"}
                </Button>
              </Form>
            ) : null}
          </div>
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-3">
              <div className="font-medium">Twilio RCS sender onboarding</div>
              <p className="text-sm text-muted-foreground">
                Twilio currently runs RCS sender creation and compliance review in Console. Save the sender package here, then finish the registration flow in Twilio.
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <a className="underline" href={TWILIO_RCS_SENDERS_URL} target="_blank" rel="noreferrer">
                  Open Twilio RCS senders
                </a>
                <a className="underline" href={TWILIO_RCS_DOCS_URL} target="_blank" rel="noreferrer">
                  View Twilio onboarding guide
                </a>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Provider</div>
                <div className="mt-1 font-medium">{TWILIO_RCS_PROVIDER}</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Messaging Service SID</div>
                <div className="mt-1 font-mono text-sm">
                  {onboarding.messagingService.serviceSid ?? "Provision Messaging Service first"}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Inbound webhook</div>
                <div className="mt-1 break-all font-mono text-xs">
                  {onboarding.subaccountBootstrap.inboundSmsUrl ?? "Bootstrap messaging first"}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Status callback</div>
                <div className="mt-1 break-all font-mono text-xs">
                  {onboarding.subaccountBootstrap.statusCallbackUrl ?? "Bootstrap messaging first"}
                </div>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              Twilio will also reuse the business basics already saved above. When those fields are present, this RCS draft auto-fills the display name, description, support email, and default region for you.
            </div>
            {onboarding.selectedChannels.includes("rcs") ? (
              rcsBlockingIssues.length > 0 ? (
                <div className="rounded-lg border p-4 text-sm">
                  <div className="font-medium">RCS still needs a few items before submission.</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {rcsBlockingIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                  The RCS sender package has the required details to move into Twilio Console review.
                </div>
              )
            ) : null}
            <Form method="post" className="space-y-4">
              <input type="hidden" name="_action" value="save_rcs" />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rcsDisplayName">Sender display name</Label>
                  <Input
                    id="rcsDisplayName"
                    name="rcsDisplayName"
                    placeholder="Acme Health Support"
                    defaultValue={onboarding.rcs.displayName}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsRegions">Destination countries</Label>
                  <Input
                    id="rcsRegions"
                    name="rcsRegions"
                    placeholder="United States, Canada"
                    defaultValue={onboarding.rcs.regions.join(", ")}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="rcsPublicDescription">Public sender description</Label>
                  <Textarea
                    id="rcsPublicDescription"
                    name="rcsPublicDescription"
                    placeholder="Explain what this sender does and how customers interact with it."
                    defaultValue={onboarding.rcs.publicDescription}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsLogoImageUrl">Logo image URL</Label>
                  <Input
                    id="rcsLogoImageUrl"
                    name="rcsLogoImageUrl"
                    type="url"
                    placeholder="https://example.com/brand-logo.png"
                    defaultValue={onboarding.rcs.logoImageUrl}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsBannerImageUrl">Banner image URL</Label>
                  <Input
                    id="rcsBannerImageUrl"
                    name="rcsBannerImageUrl"
                    type="url"
                    placeholder="https://example.com/brand-banner.png"
                    defaultValue={onboarding.rcs.bannerImageUrl}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsAccentColor">Accent color</Label>
                  <Input
                    id="rcsAccentColor"
                    name="rcsAccentColor"
                    placeholder="#0057FF"
                    defaultValue={onboarding.rcs.accentColor}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsOptInPolicyImageUrl">Opt-in policy image URL</Label>
                  <Input
                    id="rcsOptInPolicyImageUrl"
                    name="rcsOptInPolicyImageUrl"
                    type="url"
                    placeholder="https://example.com/opt-in-flow.png"
                    defaultValue={onboarding.rcs.optInPolicyImageUrl}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsUseCaseVideoUrl">Use case video URL</Label>
                  <Input
                    id="rcsUseCaseVideoUrl"
                    name="rcsUseCaseVideoUrl"
                    type="url"
                    placeholder="https://example.com/rcs-demo.mp4"
                    defaultValue={onboarding.rcs.useCaseVideoUrl}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsNotificationEmail">Notification email</Label>
                  <Input
                    id="rcsNotificationEmail"
                    name="rcsNotificationEmail"
                    type="email"
                    placeholder="compliance@acmehealth.com"
                    defaultValue={onboarding.rcs.notificationEmail}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsRepresentativeName">Authorized representative name</Label>
                  <Input
                    id="rcsRepresentativeName"
                    name="rcsRepresentativeName"
                    placeholder="Jordan Smith"
                    defaultValue={onboarding.rcs.representativeName}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsRepresentativeTitle">Authorized representative title</Label>
                  <Input
                    id="rcsRepresentativeTitle"
                    name="rcsRepresentativeTitle"
                    placeholder="Head of Operations"
                    defaultValue={onboarding.rcs.representativeTitle}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsRepresentativeEmail">Authorized representative email</Label>
                  <Input
                    id="rcsRepresentativeEmail"
                    name="rcsRepresentativeEmail"
                    type="email"
                    placeholder="jordan@acmehealth.com"
                    defaultValue={onboarding.rcs.representativeEmail}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsAgentId">Twilio or Google agent ID</Label>
                  <Input
                    id="rcsAgentId"
                    name="rcsAgentId"
                    placeholder="agent-id"
                    defaultValue={onboarding.rcs.agentId ?? ""}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsSenderId">Twilio sender ID</Label>
                  <Input
                    id="rcsSenderId"
                    name="rcsSenderId"
                    placeholder="sender-id"
                    defaultValue={onboarding.rcs.senderId ?? ""}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="rcsNotes">Ops notes</Label>
                  <Textarea
                    id="rcsNotes"
                    name="rcsNotes"
                    placeholder="Record Twilio case updates, reviewer feedback, or launch blockers."
                    defaultValue={onboarding.rcs.notes}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rcsStatus">RCS status</Label>
                  <select
                    id="rcsStatus"
                    name="rcsStatus"
                    defaultValue={onboarding.rcs.status}
                    disabled={isReadOnly}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {[
                      "not_started",
                      "collecting_business",
                      "provisioning",
                      "submitting",
                      "in_review",
                      "approved",
                      "rejected",
                      "live",
                    ].map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {!isReadOnly ? (
                <Button type="submit" disabled={isSavingRcs} aria-busy={isSavingRcs}>
                  {isSavingRcs ? "Saving RCS track..." : "Save RCS track"}
                </Button>
              ) : null}
            </Form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
