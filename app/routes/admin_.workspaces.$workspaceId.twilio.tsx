import { ActionFunctionArgs, LoaderFunctionArgs, defer, json, redirect } from "@remix-run/node";
import { Await, Form, useActionData, useLoaderData } from "@remix-run/react";
import { Suspense, useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { FileText, Image, Loader2, MessageSquare, Phone, RefreshCw } from "lucide-react";
import { toast, Toaster } from "sonner";
import { verifyAuth } from "@/lib/supabase.server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Database } from "@/lib/database.types";
import {
    createWorkspaceTwilioInstance,
    getWorkspaceTwilioPortalSnapshot,
    syncWorkspaceTwilioSnapshot,
    updateWorkspaceTwilioPortalConfig,
} from "@/lib/database.server";
import { logger } from "@/lib/logger.server";
import { groupTwilioUsageData } from "@/lib/twilio-usage";
import {
    buildOnboardingStepsForState,
    DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
    deriveWorkspaceMessagingReadiness,
} from "@/lib/messaging-onboarding.server";
import {
  TWILIO_RCS_DOCS_URL,
  TWILIO_RCS_PROVIDER,
  TWILIO_RCS_SENDERS_URL,
  updateWorkspaceRcsOnboarding,
} from "@/lib/rcs-onboarding.server";
import { ensureWorkspaceTwilioBootstrap } from "@/lib/twilio-bootstrap.server";
import { provisionWorkspaceA2P } from "@/lib/twilio-a2p.server";
import {
    TWILIO_MESSAGE_INTENT_VALUES,
    TWILIO_MULTI_TENANCY_MODE_VALUES,
    TWILIO_ONBOARDING_STATUS_VALUES,
    TWILIO_SEND_MODE_VALUES,
    TWILIO_THROUGHPUT_PRODUCT_VALUES,
    TWILIO_TRAFFIC_CLASS_VALUES,
    type WorkspaceTwilioOpsConfig,
    type WorkspaceTwilioSyncSnapshot,
} from "@/lib/types";

interface TwilioPageData {
    twilioAccountInfo: {
        sid: string;
        friendlyName: string;
        status: string;
        type: string;
        dateCreated: string;
    } | null;
    twilioNumbers: Array<{
        sid: string;
        phoneNumber: string;
        friendlyName: string;
        capabilities: {
            voice: boolean;
            sms: boolean;
            mms: boolean;
            fax: boolean;
        };
        voiceReceiveMode?: string;
        smsApplicationSid?: string;
        voiceApplicationSid?: string;
        addressRequirements?: string;
        status?: string;
    }>;
    twilioUsage: Array<{
        category: string;
        description: string;
        usage: string;
        usageUnit: string;
        price: string;
        startDate?: string;
        endDate?: string;
    }>;
    portalSnapshot: Awaited<ReturnType<typeof getWorkspaceTwilioPortalSnapshot>>;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatLabel(value: string) {
    return value
        .split("_")
        .map((part) => part.toUpperCase() === "A2P" ? part.toUpperCase() : part.replace(/^\w/, (char) => char.toUpperCase()))
        .join(" ");
}

function formatStatusLabel(value: string) {
    return value.replace(/_/g, " ");
}

function getSyncStatusBadgeVariant(status: WorkspaceTwilioSyncSnapshot["lastSyncStatus"]) {
    switch (status) {
        case "error":
            return "destructive" as const;
        case "healthy":
            return "secondary" as const;
        case "never_synced":
        case "syncing":
            return "outline" as const;
        default: {
            const exhaustiveCheck: never = status;
            return exhaustiveCheck;
        }
    }
}

function buildWorkspaceSummary({
    config,
    detectedTrafficClass,
    metrics,
}: {
    config: WorkspaceTwilioOpsConfig;
    detectedTrafficClass: string;
    metrics: TwilioPageData["portalSnapshot"]["metrics"];
}) {
    const trafficClass = config.trafficClass !== "unknown" ? config.trafficClass : detectedTrafficClass;
    const sendModeSummary =
        config.sendMode === "messaging_service"
            ? config.messagingServiceSid
                ? "sends through a Messaging Service"
                : "is set to Messaging Service mode but still needs a Messaging Service SID"
            : "sends directly from a phone number";

    return `This workspace is operating as ${formatLabel(trafficClass)}, ${sendModeSummary}, and has ${metrics.recentOutboundCount} recent outbound messages in local history.`;
}

export async function loadTwilioData(
    supabaseClient: SupabaseClient<Database>,
    workspaceId: string,
): Promise<TwilioPageData> {
    let twilioAccountInfo: TwilioPageData["twilioAccountInfo"] = null;
    let twilioNumbers: TwilioPageData["twilioNumbers"] = [];
    let twilioUsage: TwilioPageData["twilioUsage"] = [];

    const portalSnapshot = await getWorkspaceTwilioPortalSnapshot({
        supabaseClient,
        workspaceId,
    }).catch((error): Awaited<ReturnType<typeof getWorkspaceTwilioPortalSnapshot>> => {
        logger.error("Error fetching Twilio portal snapshot:", error);
        const onboarding = {
            ...DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE,
            steps: buildOnboardingStepsForState(DEFAULT_WORKSPACE_MESSAGING_ONBOARDING_STATE),
        };
        return {
            config: {
                trafficClass: "unknown",
                throughputProduct: "none",
                multiTenancyMode: "none",
                trafficShapingEnabled: false,
                defaultMessageIntent: null,
                sendMode: "from_number",
                messagingServiceSid: null,
                onboardingStatus: "not_started",
                supportNotes: "",
                updatedAt: null,
                updatedBy: null,
                auditTrail: [],
            } satisfies WorkspaceTwilioOpsConfig,
            detectedTrafficClass: "unknown" as const,
            metrics: {
                recentOutboundCount: 0,
                rawFromCount: 0,
                messagingServiceCount: 0,
                statusCounts: {},
                numberTypes: [],
            },
            recommendations: [],
            supportRequestSummary: "Unable to generate a Twilio support summary.",
            syncSnapshot: {
                accountStatus: null,
                accountFriendlyName: null,
                phoneNumberCount: 0,
                numberTypes: [],
                recentUsageCount: 0,
                usageTotalPrice: null,
                lastSyncedAt: null,
                lastSyncStatus: "never_synced" as const,
                lastSyncError: null,
            } satisfies WorkspaceTwilioSyncSnapshot,
            onboarding,
            readiness: deriveWorkspaceMessagingReadiness({
                onboarding,
                workspaceNumbers: [],
                recentOutboundCount: 0,
            }),
        };
    });

    try {
        const { data: workspace } = await supabaseClient
            .from("workspace")
            .select("*")
            .eq("id", workspaceId)
            .single();

        if (workspace?.twilio_data?.sid) {
            const twilio = await createWorkspaceTwilioInstance({
                supabase: supabaseClient,
                workspace_id: workspaceId,
            });
            const [account, numbers, usageRecords] = await Promise.all([
                twilio.api.v2010.accounts(workspace.twilio_data.sid).fetch(),
                twilio.incomingPhoneNumbers.list({ limit: 20 }),
                twilio.usage.records.list(),
            ]);

            twilioAccountInfo = {
                sid: account.sid,
                friendlyName: account.friendlyName,
                status: account.status,
                type: account.type,
                dateCreated: account.dateCreated.toISOString(),
            };

            twilioNumbers = numbers.map((number) => ({
                sid: number.sid,
                phoneNumber: number.phoneNumber,
                friendlyName: number.friendlyName,
                capabilities: number.capabilities,
                voiceReceiveMode: number.voiceReceiveMode,
                smsApplicationSid: number.smsApplicationSid,
                voiceApplicationSid: number.voiceApplicationSid,
                addressRequirements: number.addressRequirements,
                status: number.status,
            }));

            twilioUsage = usageRecords.map((record) => ({
                category: record.category,
                description: record.description,
                usage: record.usage,
                usageUnit: record.usageUnit,
                price: record.price.toString(),
                startDate: record.startDate?.toISOString(),
                endDate: record.endDate?.toISOString(),
            }));
        }
    } catch (error) {
        logger.error("Error fetching Twilio information:", error);
    }

    return {
        twilioAccountInfo,
        twilioNumbers,
        twilioUsage,
        portalSnapshot,
    };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
        throw redirect("/signin");
    }

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData.access_level !== "sudo") {
        throw redirect("/signin");
    }

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
        throw redirect("/admin?tab=workspaces");
    }

    return defer({
        twilioData: loadTwilioData(supabaseClient, workspaceId),
    });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
    const { supabaseClient, user } = await verifyAuth(request);

    if (!user) {
        throw redirect("/signin");
    }

    const { data: userData } = await supabaseClient
        .from("user")
        .select("*")
        .eq("id", user.id)
        .single();

    if (!userData || userData.access_level !== "sudo") {
        throw redirect("/signin");
    }

    const workspaceId = params.workspaceId;
    if (!workspaceId) {
        return json({ error: "Workspace ID is required" }, { status: 400 });
    }

    const formData = await request.formData();
    const actionName = formData.get("_action");

    if (actionName === "sync_twilio_workspace") {
        try {
            await syncWorkspaceTwilioSnapshot({
                supabaseClient,
                workspaceId,
            });
            return json({ success: "Twilio sync completed for this workspace" });
        } catch (error) {
            logger.error("Error syncing Twilio workspace snapshot:", error);
            return json(
                { error: error instanceof Error ? error.message : "Failed to sync Twilio workspace" },
                { status: 500 },
            );
        }
    }

    if (actionName === "bootstrap_workspace_messaging") {
        try {
            await ensureWorkspaceTwilioBootstrap({
                supabaseClient,
                workspaceId,
                actorUserId: user.id,
            });
            return json({ success: "Workspace messaging bootstrap completed" });
        } catch (error) {
            logger.error("Error bootstrapping workspace messaging:", error);
            return json(
                { error: error instanceof Error ? error.message : "Failed to bootstrap workspace messaging" },
                { status: 500 },
            );
        }
    }

    if (actionName === "provision_workspace_a2p") {
        try {
            await provisionWorkspaceA2P({
                supabaseClient,
                workspaceId,
                actorUserId: user.id,
            });
            return json({ success: "Workspace A2P provisioning started" });
        } catch (error) {
            logger.error("Error provisioning workspace A2P:", error);
            return json(
                { error: error instanceof Error ? error.message : "Failed to provision workspace A2P" },
                { status: 500 },
            );
        }
    }

    if (actionName === "save_workspace_rcs") {
        try {
            await updateWorkspaceRcsOnboarding({
                supabaseClient,
                workspaceId,
                actorUserId: user.id,
                provider: TWILIO_RCS_PROVIDER,
                displayName: typeof formData.get("rcsDisplayName") === "string" ? String(formData.get("rcsDisplayName")) : "",
                publicDescription:
                    typeof formData.get("rcsPublicDescription") === "string"
                        ? String(formData.get("rcsPublicDescription"))
                        : "",
                logoImageUrl:
                    typeof formData.get("rcsLogoImageUrl") === "string"
                        ? String(formData.get("rcsLogoImageUrl"))
                        : "",
                bannerImageUrl:
                    typeof formData.get("rcsBannerImageUrl") === "string"
                        ? String(formData.get("rcsBannerImageUrl"))
                        : "",
                accentColor:
                    typeof formData.get("rcsAccentColor") === "string"
                        ? String(formData.get("rcsAccentColor"))
                        : "",
                optInPolicyImageUrl:
                    typeof formData.get("rcsOptInPolicyImageUrl") === "string"
                        ? String(formData.get("rcsOptInPolicyImageUrl"))
                        : "",
                useCaseVideoUrl:
                    typeof formData.get("rcsUseCaseVideoUrl") === "string"
                        ? String(formData.get("rcsUseCaseVideoUrl"))
                        : "",
                representativeName:
                    typeof formData.get("rcsRepresentativeName") === "string"
                        ? String(formData.get("rcsRepresentativeName"))
                        : "",
                representativeTitle:
                    typeof formData.get("rcsRepresentativeTitle") === "string"
                        ? String(formData.get("rcsRepresentativeTitle"))
                        : "",
                representativeEmail:
                    typeof formData.get("rcsRepresentativeEmail") === "string"
                        ? String(formData.get("rcsRepresentativeEmail"))
                        : "",
                notificationEmail:
                    typeof formData.get("rcsNotificationEmail") === "string"
                        ? String(formData.get("rcsNotificationEmail"))
                        : "",
                agentId: parseOptionalString(formData.get("rcsAgentId")),
                senderId: parseOptionalString(formData.get("rcsSenderId")),
                regions: typeof formData.get("rcsRegions") === "string"
                    ? String(formData.get("rcsRegions"))
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean)
                    : [],
                notes: typeof formData.get("rcsNotes") === "string" ? String(formData.get("rcsNotes")) : "",
                status:
                    formData.get("rcsStatus") === "not_started" ||
                    formData.get("rcsStatus") === "collecting_business" ||
                    formData.get("rcsStatus") === "provisioning" ||
                    formData.get("rcsStatus") === "submitting" ||
                    formData.get("rcsStatus") === "in_review" ||
                    formData.get("rcsStatus") === "approved" ||
                    formData.get("rcsStatus") === "rejected" ||
                    formData.get("rcsStatus") === "live"
                        ? (formData.get("rcsStatus") as "not_started" | "collecting_business" | "provisioning" | "submitting" | "in_review" | "approved" | "rejected" | "live")
                        : "in_review",
            });
            return json({ success: "Workspace RCS state updated" });
        } catch (error) {
            logger.error("Error updating workspace RCS state:", error);
            return json(
                { error: error instanceof Error ? error.message : "Failed to update workspace RCS state" },
                { status: 500 },
            );
        }
    }

    if (actionName !== "update_twilio_portal") {
        return json({ error: "Invalid action" }, { status: 400 });
    }

    try {
        await updateWorkspaceTwilioPortalConfig({
            supabaseClient,
            workspaceId,
            actorUserId: user.id,
            actorUsername: userData.username ?? null,
            updates: {
                trafficClass: formData.get("trafficClass") as WorkspaceTwilioOpsConfig["trafficClass"],
                throughputProduct: formData.get("throughputProduct") as WorkspaceTwilioOpsConfig["throughputProduct"],
                multiTenancyMode: formData.get("multiTenancyMode") as WorkspaceTwilioOpsConfig["multiTenancyMode"],
                trafficShapingEnabled: formData.get("trafficShapingEnabled") === "on",
                defaultMessageIntent: parseOptionalString(formData.get("defaultMessageIntent")) as WorkspaceTwilioOpsConfig["defaultMessageIntent"],
                sendMode: formData.get("sendMode") as WorkspaceTwilioOpsConfig["sendMode"],
                messagingServiceSid: parseOptionalString(formData.get("messagingServiceSid")),
                onboardingStatus: formData.get("onboardingStatus") as WorkspaceTwilioOpsConfig["onboardingStatus"],
                supportNotes: typeof formData.get("supportNotes") === "string" ? String(formData.get("supportNotes")) : "",
            },
        });

        return json({ success: "Twilio portal settings updated" });
    } catch (error) {
        logger.error("Error updating Twilio portal settings:", error);
        return json(
            { error: error instanceof Error ? error.message : "Failed to update Twilio portal settings" },
            { status: 500 },
        );
    }
};

function LoadingCard({ title, description }: { title: string; description: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading...</span>
                </div>
            </CardContent>
        </Card>
    );
}

function PortalForm({
    config,
    detectedTrafficClass,
    metrics,
}: {
    config: WorkspaceTwilioOpsConfig;
    detectedTrafficClass: TwilioPageData["portalSnapshot"]["detectedTrafficClass"];
    metrics: TwilioPageData["portalSnapshot"]["metrics"];
}) {
    const suggestedTrafficClass =
        config.trafficClass !== "unknown" ? config.trafficClass : detectedTrafficClass;
    const suggestedSendMode =
        config.sendMode === "messaging_service" ||
        (config.sendMode === "from_number" &&
            !config.messagingServiceSid &&
            metrics.messagingServiceCount > metrics.rawFromCount)
            ? "messaging_service"
            : "from_number";

    return (
        <Form method="post" className="space-y-6">
            <input type="hidden" name="_action" value="update_twilio_portal" />

            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold">Sending defaults</h3>
                    <p className="text-sm text-muted-foreground">
                        These are the workspace-level defaults the app will use when callers do not override send behavior.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="sendMode">How should messages be sent?</Label>
                        <select
                            id="sendMode"
                            name="sendMode"
                            defaultValue={suggestedSendMode}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {TWILIO_SEND_MODE_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {formatLabel(value)}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            {metrics.messagingServiceCount > 0
                                ? `Observed ${metrics.messagingServiceCount} recent sends via Messaging Service.`
                                : "No recent Messaging Service sends detected in local history."}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="messagingServiceSid">Messaging Service SID</Label>
                        <Input
                            id="messagingServiceSid"
                            name="messagingServiceSid"
                            defaultValue={config.messagingServiceSid ?? ""}
                            placeholder="MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                        />
                        <p className="text-xs text-muted-foreground">
                            Only needed when using Messaging Service mode.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="defaultMessageIntent">Default MessageIntent</Label>
                        <select
                            id="defaultMessageIntent"
                            name="defaultMessageIntent"
                            defaultValue={config.defaultMessageIntent ?? ""}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="">None</option>
                            {TWILIO_MESSAGE_INTENT_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {formatLabel(value)}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Use this when important traffic should be tagged automatically unless callers provide an override.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="trafficShapingEnabled">Priority routing</Label>
                        <div className="flex min-h-10 items-center gap-2 rounded-md border border-input px-3">
                            <input
                                id="trafficShapingEnabled"
                                name="trafficShapingEnabled"
                                type="checkbox"
                                defaultChecked={config.trafficShapingEnabled}
                                className="h-4 w-4 rounded border border-input"
                            />
                            <Label htmlFor="trafficShapingEnabled" className="cursor-pointer">
                                Enable Traffic Shaping
                            </Label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Recommended when urgent notifications should not sit behind bulk campaign traffic.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold">Detected traffic and Twilio onboarding</h3>
                    <p className="text-sm text-muted-foreground">
                        These fields shape throughput recommendations. They start from observed data when the saved config is still unset.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="trafficClass">What kind of traffic is this?</Label>
                        <select
                            id="trafficClass"
                            name="trafficClass"
                            defaultValue={suggestedTrafficClass}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {TWILIO_TRAFFIC_CLASS_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {formatLabel(value)}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            {detectedTrafficClass !== "unknown"
                                ? `Detected from current numbers: ${formatLabel(detectedTrafficClass)}.`
                                : "No clear sender type detected from current numbers yet."}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="onboardingStatus">Twilio onboarding status</Label>
                        <select
                            id="onboardingStatus"
                            name="onboardingStatus"
                            defaultValue={config.onboardingStatus}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {TWILIO_ONBOARDING_STATUS_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {formatLabel(value)}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Tracks whether parent-account throughput enablement has been planned, requested, or completed.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="throughputProduct">Throughput product</Label>
                        <select
                            id="throughputProduct"
                            name="throughputProduct"
                            defaultValue={config.throughputProduct}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {TWILIO_THROUGHPUT_PRODUCT_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {formatLabel(value)}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Advanced setting. Only applies once Twilio has enabled the parent-account throughput product.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="multiTenancyMode">Multi-Tenancy Mode</Label>
                        <select
                            id="multiTenancyMode"
                            name="multiTenancyMode"
                            defaultValue={config.multiTenancyMode}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {TWILIO_MULTI_TENANCY_MODE_VALUES.map((value) => (
                                <option key={value} value={value}>
                                    {formatLabel(value)}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Advanced setting for how shared parent-account throughput should be distributed across subaccounts.
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold">Operator context</h3>
                    <p className="text-sm text-muted-foreground">
                        Keep ticket notes and escalation details here so operators understand the current rollout state.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="supportNotes">Operator Notes</Label>
                    <Textarea
                        id="supportNotes"
                        name="supportNotes"
                        defaultValue={config.supportNotes}
                        placeholder="Document carrier constraints, Twilio ticket context, or rollout notes."
                    />
                </div>
            </div>

            <div className="flex justify-end">
                <Button type="submit">Save Workspace Twilio Setup</Button>
            </div>
        </Form>
    );
}

function PortalContent({ data }: { data: TwilioPageData }) {
    const { groupedUsage, totalPrice: totalUsageCost } = groupTwilioUsageData(data.twilioUsage);
    const { config, detectedTrafficClass, metrics, recommendations, supportRequestSummary, syncSnapshot, onboarding, readiness } = data.portalSnapshot;

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle>Onboarding readiness</CardTitle>
                            <CardDescription>
                                This summarizes the new Messaging Service-first onboarding state, emergency voice readiness, and any compatibility warnings.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Form method="post">
                                <input type="hidden" name="_action" value="bootstrap_workspace_messaging" />
                                <Button variant="outline" type="submit">
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Bootstrap messaging
                                </Button>
                            </Form>
                            <Form method="post">
                                <input type="hidden" name="_action" value="provision_workspace_a2p" />
                                <Button variant="outline" type="submit">
                                    <FileText className="mr-2 h-4 w-4" />
                                    Provision A2P
                                </Button>
                            </Form>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Onboarding status</div>
                            <div className="mt-1 font-medium">{formatLabel(onboarding.status)}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Current step</div>
                            <div className="mt-1 font-medium">{formatLabel(onboarding.currentStep)}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Messaging readiness</div>
                            <div className="mt-1 font-medium">{readiness.messagingReady ? "Ready" : "Needs setup"}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Voice readiness</div>
                            <div className="mt-1 font-medium">{readiness.voiceReady ? "Ready" : "Needs review"}</div>
                        </div>
                    </div>

                    {readiness.warnings.length > 0 ? (
                        <div className="space-y-3">
                            {readiness.warnings.map((warning, index) => (
                                <Alert key={`${warning}-${index}`} variant="destructive">
                                    <AlertTitle>Readiness warning</AlertTitle>
                                    <AlertDescription>{warning}</AlertDescription>
                                </Alert>
                            ))}
                        </div>
                    ) : (
                        <Alert>
                            <AlertTitle>No onboarding warnings</AlertTitle>
                            <AlertDescription>
                                Messaging, voice compliance, and channel setup are aligned with the current readiness checks.
                            </AlertDescription>
                        </Alert>
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
                                    {step.description ?? "No extra detail recorded."}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                        Twilio currently manages RCS sender creation and compliance review in Console. Save the sender package here, then continue the registration flow in Twilio.
                        <div className="mt-3 flex flex-wrap gap-3">
                            <a className="underline" href={TWILIO_RCS_SENDERS_URL} target="_blank" rel="noreferrer">
                                Open Twilio RCS senders
                            </a>
                            <a className="underline" href={TWILIO_RCS_DOCS_URL} target="_blank" rel="noreferrer">
                                View Twilio onboarding guide
                            </a>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

                    <Form method="post" className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                        <input type="hidden" name="_action" value="save_workspace_rcs" />
                        <div className="space-y-2">
                            <Label htmlFor="rcsDisplayName">Sender display name</Label>
                            <Input id="rcsDisplayName" name="rcsDisplayName" defaultValue={onboarding.rcs.displayName} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsRegions">Destination countries</Label>
                            <Input id="rcsRegions" name="rcsRegions" defaultValue={onboarding.rcs.regions.join(", ")} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="rcsPublicDescription">Public sender description</Label>
                            <Textarea
                                id="rcsPublicDescription"
                                name="rcsPublicDescription"
                                defaultValue={onboarding.rcs.publicDescription}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsLogoImageUrl">Logo image URL</Label>
                            <Input id="rcsLogoImageUrl" name="rcsLogoImageUrl" defaultValue={onboarding.rcs.logoImageUrl} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsBannerImageUrl">Banner image URL</Label>
                            <Input
                                id="rcsBannerImageUrl"
                                name="rcsBannerImageUrl"
                                defaultValue={onboarding.rcs.bannerImageUrl}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsAccentColor">Accent color</Label>
                            <Input id="rcsAccentColor" name="rcsAccentColor" defaultValue={onboarding.rcs.accentColor} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsOptInPolicyImageUrl">Opt-in policy image URL</Label>
                            <Input
                                id="rcsOptInPolicyImageUrl"
                                name="rcsOptInPolicyImageUrl"
                                defaultValue={onboarding.rcs.optInPolicyImageUrl}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsUseCaseVideoUrl">Use case video URL</Label>
                            <Input
                                id="rcsUseCaseVideoUrl"
                                name="rcsUseCaseVideoUrl"
                                defaultValue={onboarding.rcs.useCaseVideoUrl}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsNotificationEmail">Notification email</Label>
                            <Input
                                id="rcsNotificationEmail"
                                name="rcsNotificationEmail"
                                defaultValue={onboarding.rcs.notificationEmail}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsRepresentativeName">Authorized representative name</Label>
                            <Input
                                id="rcsRepresentativeName"
                                name="rcsRepresentativeName"
                                defaultValue={onboarding.rcs.representativeName}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsRepresentativeTitle">Authorized representative title</Label>
                            <Input
                                id="rcsRepresentativeTitle"
                                name="rcsRepresentativeTitle"
                                defaultValue={onboarding.rcs.representativeTitle}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsRepresentativeEmail">Authorized representative email</Label>
                            <Input
                                id="rcsRepresentativeEmail"
                                name="rcsRepresentativeEmail"
                                defaultValue={onboarding.rcs.representativeEmail}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsAgentId">Twilio or Google agent ID</Label>
                            <Input id="rcsAgentId" name="rcsAgentId" defaultValue={onboarding.rcs.agentId ?? ""} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsSenderId">Twilio sender ID</Label>
                            <Input id="rcsSenderId" name="rcsSenderId" defaultValue={onboarding.rcs.senderId ?? ""} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="rcsNotes">Ops notes</Label>
                            <Textarea id="rcsNotes" name="rcsNotes" defaultValue={onboarding.rcs.notes} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rcsStatus">RCS status</Label>
                            <select
                                id="rcsStatus"
                                name="rcsStatus"
                                defaultValue={onboarding.rcs.status}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {["not_started", "collecting_business", "provisioning", "submitting", "in_review", "approved", "rejected", "live"].map((status) => (
                                    <option key={status} value={status}>
                                        {formatLabel(status)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end justify-end">
                            <Button type="submit">Save RCS state</Button>
                        </div>
                    </Form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Twilio Sending Setup</CardTitle>
                    <CardDescription>
                        Review what the system sees, then set the workspace defaults used for delivery, prioritization, and Twilio throughput onboarding.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert>
                        <AlertTitle>Workspace summary</AlertTitle>
                        <AlertDescription>
                            {buildWorkspaceSummary({ config, detectedTrafficClass, metrics })}
                        </AlertDescription>
                    </Alert>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Detected traffic</div>
                            <div className="mt-1 font-medium">{formatLabel(detectedTrafficClass)}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Current send path</div>
                            <div className="mt-1 font-medium">
                                {config.sendMode === "messaging_service" ? "Messaging Service" : "Phone number"}
                            </div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Last Twilio sync</div>
                            <div className="mt-1 font-medium">
                                {syncSnapshot.lastSyncedAt
                                    ? new Date(syncSnapshot.lastSyncedAt).toLocaleString()
                                    : "Never"}
                            </div>
                            <div className="mt-2">
                                <Badge variant={getSyncStatusBadgeVariant(syncSnapshot.lastSyncStatus)}>
                                    {syncSnapshot.lastSyncStatus}
                                </Badge>
                            </div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Observed account status</div>
                            <div className="mt-1 font-medium">{syncSnapshot.accountStatus ?? "Unknown"}</div>
                        </div>
                    </div>

                    <PortalForm config={config} detectedTrafficClass={detectedTrafficClass} metrics={metrics} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle>Operational Guidance</CardTitle>
                            <CardDescription>
                                Derived guidance from saved workspace settings, current sender types, and recent outbound activity.
                            </CardDescription>
                        </div>
                        <Form method="post">
                            <input type="hidden" name="_action" value="sync_twilio_workspace" />
                            <Button variant="outline" type="submit">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Sync Now
                            </Button>
                        </Form>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Saved traffic class</div>
                            <div className="mt-1 font-medium">{formatLabel(config.trafficClass)}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Detected sender type</div>
                            <div className="mt-1 font-medium">{formatLabel(detectedTrafficClass)}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Onboarding status</div>
                            <div className="mt-1 font-medium">{formatLabel(config.onboardingStatus)}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Throughput product</div>
                            <div className="mt-1 font-medium">{formatLabel(config.throughputProduct)}</div>
                        </div>
                    </div>

                    {recommendations.length > 0 ? (
                        <div className="space-y-3">
                            {recommendations.map((recommendation, index) => (
                                <Alert key={`${recommendation.message}-${index}`} variant={recommendation.severity === "warning" ? "destructive" : "default"}>
                                    <AlertTitle>{recommendation.severity === "warning" ? "Warning" : "Recommendation"}</AlertTitle>
                                    <AlertDescription>{recommendation.message}</AlertDescription>
                                </Alert>
                            ))}
                        </div>
                    ) : (
                        <Alert>
                            <AlertTitle>No active warnings</AlertTitle>
                            <AlertDescription>
                                This workspace does not currently have any derived throughput warnings from the portal rules.
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="supportRequestSummary">Twilio support-ready summary</Label>
                        <Textarea
                            id="supportRequestSummary"
                            readOnly
                            value={supportRequestSummary}
                            className="min-h-[220px] font-mono text-xs"
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Observed Messaging Signals</CardTitle>
                    <CardDescription>
                        Recent outbound SMS behavior from local message records and synced sender inventory.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Recent outbound</div>
                            <div className="mt-1 text-2xl font-semibold">{metrics.recentOutboundCount}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Messaging Service sends</div>
                            <div className="mt-1 text-2xl font-semibold">{metrics.messagingServiceCount}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Raw From sends</div>
                            <div className="mt-1 text-2xl font-semibold">{metrics.rawFromCount}</div>
                        </div>
                        <div className="rounded-lg border p-4">
                            <div className="text-sm text-muted-foreground">Number types</div>
                            <div className="mt-1 font-medium">{metrics.numberTypes.length ? metrics.numberTypes.join(", ") : "None detected"}</div>
                        </div>
                    </div>

                    <Alert>
                        <AlertTitle>What is auto-detected here?</AlertTitle>
                        <AlertDescription>
                            Sender type, number mix, recent send path usage, delivery status mix, and sync freshness are derived from Twilio/account data and local message history. The form above is where operators set workspace defaults and overrides.
                        </AlertDescription>
                    </Alert>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Count</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {Object.entries(metrics.statusCounts).length > 0 ? (
                                Object.entries(metrics.statusCounts).map(([status, count]) => (
                                    <TableRow key={status}>
                                        <TableCell className="font-medium">{formatStatusLabel(status)}</TableCell>
                                        <TableCell className="text-right">{count}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                                        No recent outbound message records found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Config Changes</CardTitle>
                    <CardDescription>Lightweight audit trail stored with the Twilio portal settings.</CardDescription>
                </CardHeader>
                <CardContent>
                    {config.auditTrail.length > 0 ? (
                        <div className="space-y-4">
                            {config.auditTrail.map((entry, index) => (
                                <div key={`${entry.changedAt}-${index}`} className="rounded-lg border p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="font-medium">{entry.summary}</div>
                                        <Badge variant="outline">{new Date(entry.changedAt).toLocaleString()}</Badge>
                                    </div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {entry.actorUsername ?? entry.actorUserId ?? "Unknown operator"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-4 text-center text-muted-foreground">
                            No portal changes have been recorded yet.
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Twilio Subaccount Information</CardTitle>
                    <CardDescription>Details about the Twilio subaccount for this workspace.</CardDescription>
                </CardHeader>
                <CardContent>
                    {data.twilioAccountInfo ? (
                        <dl className="space-y-4">
                            <div className="flex flex-col">
                                <dt className="text-sm font-medium text-muted-foreground">Account SID</dt>
                                <dd className="mt-1 font-mono text-sm">{data.twilioAccountInfo.sid}</dd>
                            </div>
                            <div className="flex flex-col">
                                <dt className="text-sm font-medium text-muted-foreground">Friendly Name</dt>
                                <dd className="mt-1 text-sm">{data.twilioAccountInfo.friendlyName}</dd>
                            </div>
                            <div className="flex flex-col">
                                <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                                <dd className="mt-1 text-sm">
                                    <Badge variant={data.twilioAccountInfo.status === "active" ? "secondary" : "outline"}>
                                        {data.twilioAccountInfo.status}
                                    </Badge>
                                </dd>
                            </div>
                            <div className="flex flex-col">
                                <dt className="text-sm font-medium text-muted-foreground">Type</dt>
                                <dd className="mt-1 text-sm">{data.twilioAccountInfo.type}</dd>
                            </div>
                            <div className="flex flex-col">
                                <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                                <dd className="mt-1 text-sm">{new Date(data.twilioAccountInfo.dateCreated).toLocaleString()}</dd>
                            </div>
                        </dl>
                    ) : (
                        <div className="py-4 text-center text-muted-foreground">
                            Unable to fetch Twilio account information.
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Phone Numbers</CardTitle>
                    <CardDescription>Phone numbers associated with this Twilio subaccount.</CardDescription>
                </CardHeader>
                <CardContent>
                    {data.twilioNumbers.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Phone Number</TableHead>
                                    <TableHead>Friendly Name</TableHead>
                                    <TableHead>Capabilities</TableHead>
                                    <TableHead>Media</TableHead>
                                    <TableHead>Region</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.twilioNumbers.map((number) => (
                                    <TableRow key={number.sid}>
                                        <TableCell className="font-medium">{number.phoneNumber}</TableCell>
                                        <TableCell>{number.friendlyName}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {number.capabilities.voice && (
                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                        <Phone className="h-3 w-3" />
                                                        Voice
                                                    </Badge>
                                                )}
                                                {number.capabilities.sms && (
                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                        <MessageSquare className="h-3 w-3" />
                                                        SMS
                                                    </Badge>
                                                )}
                                                {number.capabilities.mms && (
                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                        <Image className="h-3 w-3" />
                                                        MMS
                                                    </Badge>
                                                )}
                                                {number.capabilities.fax && (
                                                    <Badge variant="outline" className="flex items-center gap-1">
                                                        <FileText className="h-3 w-3" />
                                                        Fax
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="space-y-1">
                                                {number.voiceReceiveMode && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        Voice: {number.voiceReceiveMode}
                                                    </Badge>
                                                )}
                                                {number.smsApplicationSid && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        SMS App Configured
                                                    </Badge>
                                                )}
                                                {number.voiceApplicationSid && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        Voice App Configured
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">{number.addressRequirements || "No address requirements"}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={number.status === "in-use" ? "secondary" : "outline"}>
                                                {number.status || "Active"}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="py-4 text-center text-muted-foreground">
                            No phone numbers found for this account.
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Usage</CardTitle>
                    <CardDescription>Usage statistics for the last 30 days.</CardDescription>
                </CardHeader>
                <CardContent>
                    {data.twilioUsage.length > 0 ? (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">Category</TableHead>
                                        <TableHead>Details</TableHead>
                                        <TableHead className="text-right">Cost</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {Object.entries(groupedUsage)
                                        .sort((a, b) => b[1].price - a[1].price)
                                        .map(([category, usage]) => (
                                            <TableRow key={category}>
                                                <TableCell className="font-medium">{category}</TableCell>
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        {usage.details.map((detail, index) => (
                                                            <div key={`${detail.description}-${index}`} className="text-sm">
                                                                <span className="text-muted-foreground">{detail.description}: </span>
                                                                <span className="font-medium">
                                                                    {detail.usage} {detail.usageUnit}
                                                                </span>
                                                                {parseFloat(detail.price) > 0 && (
                                                                    <span className="ml-2 text-muted-foreground">
                                                                        (${parseFloat(detail.price).toFixed(2)})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    ${usage.price.toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    <TableRow className="font-bold">
                                        <TableCell>Total</TableCell>
                                        <TableCell />
                                        <TableCell className="text-right">${totalUsageCost.toFixed(2)}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                            <p className="mt-4 text-sm text-muted-foreground">
                                Usage data for the last 30 days.
                            </p>
                        </>
                    ) : (
                        <div className="py-4 text-center text-muted-foreground">
                            No usage data available.
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
}

export default function WorkspaceTwilio() {
    const { twilioData } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();

    useEffect(() => {
        if (actionData && "success" in actionData) {
            toast.success(actionData.success);
        }

        if (actionData && "error" in actionData) {
            toast.error(actionData.error);
        }
    }, [actionData]);

    return (
        <div className="grid grid-cols-1 gap-6">
            <Toaster position="top-right" />
            <Suspense fallback={<LoadingCard title="Twilio Ops Portal" description="Loading Twilio account, strategy, and messaging insights..." />}>
                <Await resolve={twilioData}>
                    {(data: TwilioPageData) => <PortalContent data={data} />}
                </Await>
            </Suspense>
        </div>
    );
}