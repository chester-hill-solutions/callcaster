import { ActionFunctionArgs, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getUserRole,
  getWorkspaceInfo,
  getWorkspacePhoneNumbers,
  requireWorkspaceAccess,
} from "@/lib/database.server";
import { verifyAuth } from "@/lib/supabase.server";
import {
  buildOnboardingStepsForState,
  deriveWorkspaceMessagingReadiness,
  getWorkspaceMessagingOnboardingState,
  mergeWorkspaceMessagingOnboardingState,
  updateWorkspaceMessagingOnboardingState,
} from "@/lib/messaging-onboarding.server";
import { updateWorkspaceRcsOnboarding } from "@/lib/rcs-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import type {
  User,
  WorkspaceMessagingBusinessProfile,
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingStatus,
} from "@/lib/types";

type LoaderData = {
  workspaceId: string;
  workspaceName: string;
  userRole: string | null | undefined;
  onboarding: Awaited<ReturnType<typeof getWorkspaceMessagingOnboardingState>>;
  readiness: ReturnType<typeof deriveWorkspaceMessagingReadiness>;
  phoneNumbers: Awaited<ReturnType<typeof getWorkspacePhoneNumbers>>["data"];
};

type ActionData = {
  success?: string;
  error?: string;
};

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

function asWorkspaceOnboardingStatus(value: FormDataEntryValue | null): WorkspaceOnboardingStatus {
  switch (value) {
    case "not_started":
    case "collecting_business":
    case "provisioning":
    case "submitting":
    case "in_review":
    case "approved":
    case "rejected":
    case "live":
      return value;
    default:
      return "in_review";
  }
}

function readSelectedChannels(formData: FormData): WorkspaceOnboardingChannel[] {
  const values = formData.getAll("selectedChannels").map(String);
  return values.filter((value): value is WorkspaceOnboardingChannel =>
    CHANNEL_OPTIONS.some((option) => option.id === value),
  );
}

function buildBusinessProfile(formData: FormData): WorkspaceMessagingBusinessProfile {
  const sampleMessages = String(formData.get("sampleMessages") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    legalBusinessName: String(formData.get("legalBusinessName") ?? ""),
    businessType: String(formData.get("businessType") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    privacyPolicyUrl: String(formData.get("privacyPolicyUrl") ?? ""),
    termsOfServiceUrl: String(formData.get("termsOfServiceUrl") ?? ""),
    supportEmail: String(formData.get("supportEmail") ?? ""),
    supportPhone: String(formData.get("supportPhone") ?? ""),
    useCaseSummary: String(formData.get("useCaseSummary") ?? ""),
    optInWorkflow: String(formData.get("optInWorkflow") ?? ""),
    optInKeywords: String(formData.get("optInKeywords") ?? ""),
    optOutKeywords: String(formData.get("optOutKeywords") ?? ""),
    helpKeywords: String(formData.get("helpKeywords") ?? ""),
    sampleMessages,
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    throw redirect("/workspaces", { headers });
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId,
  });

  const userRole = (
    await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId,
    })
  )?.role;
  const [{ data: workspaceInfo }, { data: phoneNumbers }, onboarding] = await Promise.all([
    getWorkspaceInfo({ supabaseClient, workspaceId }),
    getWorkspacePhoneNumbers({ supabaseClient, workspaceId }),
    getWorkspaceMessagingOnboardingState({ supabaseClient, workspaceId }),
  ]);

  const readiness = deriveWorkspaceMessagingReadiness({
    onboarding,
    workspaceNumbers: (phoneNumbers ?? []).map((number) => ({
      type: number?.type ?? null,
      phone_number: number?.phone_number ?? null,
      capabilities: number?.capabilities ?? null,
    })),
    recentOutboundCount: 0,
  });

  return json<LoaderData>(
    {
      workspaceId,
      workspaceName: workspaceInfo?.name ?? "Workspace",
      userRole,
      onboarding,
      readiness,
      phoneNumbers,
    },
    { headers },
  );
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { supabaseClient, user, headers } = await verifyAuth(request);
  if (!user) {
    throw redirect("/signin", { headers });
  }

  const workspaceId = params.id;
  if (!workspaceId) {
    return json<ActionData>({ error: "Workspace ID is required." }, { status: 400 });
  }

  await requireWorkspaceAccess({
    supabaseClient,
    user,
    workspaceId,
  });

  const role = (
    await getUserRole({
      supabaseClient,
      user: user as unknown as User,
      workspaceId,
    })
  )?.role;

  if (role !== "owner" && role !== "admin") {
    return json<ActionData>(
      { error: "Only workspace admins can change onboarding state." },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const actionName = String(formData.get("_action") ?? "");

  try {
    if (actionName === "save_channels") {
      const current = await getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
      });
      const selectedChannels = readSelectedChannels(formData);
      const nextState = mergeWorkspaceMessagingOnboardingState(current, {
        selectedChannels,
        status: "collecting_business",
        currentStep: "messaging_service",
      });
      nextState.steps = buildOnboardingStepsForState(nextState);
      await updateWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
        updates: nextState,
        actorUserId: user.id,
      });
      return json<ActionData>({ success: "Onboarding channels updated." });
    }

    if (actionName === "bootstrap_messaging_service") {
      await ensureWorkspaceTwilioBootstrap({
        supabaseClient,
        workspaceId,
        actorUserId: user.id,
      });
      return json<ActionData>({ success: "Messaging Service bootstrap completed." });
    }

    if (actionName === "save_business_profile") {
      const current = await getWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
      });
      const businessProfile = buildBusinessProfile(formData);
      const addressStreet = String(formData.get("addressStreet") ?? "");
      const addressCity = String(formData.get("addressCity") ?? "");
      const addressRegion = String(formData.get("addressRegion") ?? "");
      const addressPostalCode = String(formData.get("addressPostalCode") ?? "");
      const addressCountryCode = String(formData.get("addressCountryCode") ?? "US");
      const hasEmergencyAddress = Boolean(
        addressStreet.trim() &&
        addressCity.trim() &&
        addressRegion.trim() &&
        addressPostalCode.trim(),
      );
      const nextState = mergeWorkspaceMessagingOnboardingState(current, {
        businessProfile,
        status: "collecting_business",
        currentStep: "use_case",
        emergencyVoice: {
          ...current.emergencyVoice,
          status: hasEmergencyAddress ? "collecting_business" : current.emergencyVoice.status,
          enabled: hasEmergencyAddress,
          address: {
            ...current.emergencyVoice.address,
            customerName: businessProfile.legalBusinessName,
            street: addressStreet,
            city: addressCity,
            region: addressRegion,
            postalCode: addressPostalCode,
            countryCode: addressCountryCode,
            status: hasEmergencyAddress ? "pending_validation" : "not_started",
          },
        },
      });
      nextState.steps = buildOnboardingStepsForState(nextState);
      await updateWorkspaceMessagingOnboardingState({
        supabaseClient,
        workspaceId,
        updates: nextState,
        actorUserId: user.id,
      });
      return json<ActionData>({ success: "Business and compliance details saved." });
    }

    if (actionName === "provision_a2p") {
      await provisionWorkspaceA2P({
        supabaseClient,
        workspaceId,
        actorUserId: user.id,
      });
      return json<ActionData>({ success: "A2P provisioning was started." });
    }

    if (actionName === "save_rcs") {
      await updateWorkspaceRcsOnboarding({
        supabaseClient,
        workspaceId,
        actorUserId: user.id,
        provider: String(formData.get("rcsProvider") ?? "").trim() || null,
        regions: String(formData.get("rcsRegions") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        notes: String(formData.get("rcsNotes") ?? ""),
        status: asWorkspaceOnboardingStatus(formData.get("rcsStatus")),
      });
      return json<ActionData>({ success: "RCS onboarding state updated." });
    }

    return json<ActionData>({ error: "Unknown onboarding action." }, { status: 400 });
  } catch (error) {
    return json<ActionData>(
      {
        error: error instanceof Error ? error.message : "Onboarding update failed.",
      },
      { status: 500 },
    );
  }
};

export default function WorkspaceMessagingOnboardingRoute() {
  const { workspaceId, workspaceName, userRole, onboarding, readiness, phoneNumbers } =
    useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
    if (actionData?.success) {
      toast.success(actionData.success);
    }
  }, [actionData]);

  const isReadOnly = userRole !== "owner" && userRole !== "admin";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Messaging onboarding for {workspaceName}</CardTitle>
          <CardDescription>
            Set up Messaging Service defaults, automate A2P onboarding, capture emergency voice readiness, and leave room for future RCS activation.
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
          <CardTitle>1. Choose channels</CardTitle>
          <CardDescription>
            Decide which onboarding tracks should stay active for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="save_channels" />
            <div className="grid gap-4 md:grid-cols-3">
              {CHANNEL_OPTIONS.map((option) => (
                <label key={option.id} className="rounded-lg border p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name="selectedChannels"
                      value={option.id}
                      defaultChecked={onboarding.selectedChannels.includes(option.id)}
                      disabled={isReadOnly}
                    />
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {!isReadOnly ? <Button type="submit">Save channel selection</Button> : null}
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Messaging Service bootstrap</CardTitle>
          <CardDescription>
            Provision the default Messaging Service so new sending behavior can move to a Messaging Service-first model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <Button type="submit">Provision Messaging Service</Button>
            </Form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Business, compliance, and emergency details</CardTitle>
          <CardDescription>
            Capture the information needed for channel onboarding and voice emergency readiness.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-6">
            <input type="hidden" name="_action" value="save_business_profile" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legalBusinessName">Legal business name</Label>
                <Input
                  id="legalBusinessName"
                  name="legalBusinessName"
                  defaultValue={onboarding.businessProfile.legalBusinessName}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessType">Business type</Label>
                <Input
                  id="businessType"
                  name="businessType"
                  defaultValue={onboarding.businessProfile.businessType}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website URL</Label>
                <Input
                  id="websiteUrl"
                  name="websiteUrl"
                  defaultValue={onboarding.businessProfile.websiteUrl}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="privacyPolicyUrl">Privacy policy URL</Label>
                <Input
                  id="privacyPolicyUrl"
                  name="privacyPolicyUrl"
                  defaultValue={onboarding.businessProfile.privacyPolicyUrl}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="termsOfServiceUrl">Terms of service URL</Label>
                <Input
                  id="termsOfServiceUrl"
                  name="termsOfServiceUrl"
                  defaultValue={onboarding.businessProfile.termsOfServiceUrl}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportEmail">Support email</Label>
                <Input
                  id="supportEmail"
                  name="supportEmail"
                  defaultValue={onboarding.businessProfile.supportEmail}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supportPhone">Support phone</Label>
                <Input
                  id="supportPhone"
                  name="supportPhone"
                  defaultValue={onboarding.businessProfile.supportPhone}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="useCaseSummary">Use case summary</Label>
                <Textarea
                  id="useCaseSummary"
                  name="useCaseSummary"
                  defaultValue={onboarding.businessProfile.useCaseSummary}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="optInWorkflow">Opt-in workflow</Label>
                <Textarea
                  id="optInWorkflow"
                  name="optInWorkflow"
                  defaultValue={onboarding.businessProfile.optInWorkflow}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="optInKeywords">Opt-in keywords</Label>
                <Input
                  id="optInKeywords"
                  name="optInKeywords"
                  defaultValue={onboarding.businessProfile.optInKeywords}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="optOutKeywords">Opt-out keywords</Label>
                <Input
                  id="optOutKeywords"
                  name="optOutKeywords"
                  defaultValue={onboarding.businessProfile.optOutKeywords}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="helpKeywords">Help keywords</Label>
                <Input
                  id="helpKeywords"
                  name="helpKeywords"
                  defaultValue={onboarding.businessProfile.helpKeywords}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sampleMessages">Sample messages</Label>
                <Textarea
                  id="sampleMessages"
                  name="sampleMessages"
                  defaultValue={onboarding.businessProfile.sampleMessages.join("\n")}
                  disabled={isReadOnly}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="addressStreet">Emergency address street</Label>
                <Input
                  id="addressStreet"
                  name="addressStreet"
                  defaultValue={onboarding.emergencyVoice.address.street}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressCity">City</Label>
                <Input
                  id="addressCity"
                  name="addressCity"
                  defaultValue={onboarding.emergencyVoice.address.city}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressRegion">State or region</Label>
                <Input
                  id="addressRegion"
                  name="addressRegion"
                  defaultValue={onboarding.emergencyVoice.address.region}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressPostalCode">Postal code</Label>
                <Input
                  id="addressPostalCode"
                  name="addressPostalCode"
                  defaultValue={onboarding.emergencyVoice.address.postalCode}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressCountryCode">Country code</Label>
                <Input
                  id="addressCountryCode"
                  name="addressCountryCode"
                  defaultValue={onboarding.emergencyVoice.address.countryCode}
                  disabled={isReadOnly}
                />
              </div>
            </div>
            {!isReadOnly ? <Button type="submit">Save business details</Button> : null}
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Provider actions</CardTitle>
          <CardDescription>
            Start automated A2P provisioning and track the parallel RCS path.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <div className="font-medium">A2P 10DLC</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Brand SID: {onboarding.a2p10dlc.brandSid ?? "Not created"}.
                Campaign SID: {onboarding.a2p10dlc.campaignSid ?? "Not created"}.
              </p>
            </div>
            {!isReadOnly ? (
              <Form method="post">
                <input type="hidden" name="_action" value="provision_a2p" />
                <Button type="submit">Provision A2P resources</Button>
              </Form>
            ) : null}
          </div>
          <div className="space-y-4 rounded-lg border p-4">
            <Form method="post" className="space-y-4">
              <input type="hidden" name="_action" value="save_rcs" />
              <div className="space-y-2">
                <Label htmlFor="rcsProvider">RCS provider</Label>
                <Input
                  id="rcsProvider"
                  name="rcsProvider"
                  defaultValue={onboarding.rcs.provider ?? ""}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rcsRegions">RCS regions</Label>
                <Input
                  id="rcsRegions"
                  name="rcsRegions"
                  defaultValue={onboarding.rcs.regions.join(", ")}
                  disabled={isReadOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rcsNotes">RCS notes</Label>
                <Textarea
                  id="rcsNotes"
                  name="rcsNotes"
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
              {!isReadOnly ? <Button type="submit">Save RCS track</Button> : null}
            </Form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
