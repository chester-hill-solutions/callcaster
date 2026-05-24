import { Form } from "react-router";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    TWILIO_MESSAGE_INTENT_VALUES,
    TWILIO_MULTI_TENANCY_MODE_VALUES,
    TWILIO_ONBOARDING_STATUS_VALUES,
    TWILIO_SEND_MODE_VALUES,
    TWILIO_THROUGHPUT_PRODUCT_VALUES,
    TWILIO_TRAFFIC_CLASS_VALUES,
    type WorkspaceTwilioOpsConfig,
} from "@/lib/types";

import type { TwilioPageData } from "../loadTwilioData.server";

import { formatLabel } from "./AdminTwilioPortal.utils";

export function PortalForm({
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
                    <FormField
                        htmlFor="sendMode"
                        label="How should messages be sent?"
                        description={
                            metrics.messagingServiceCount > 0
                                ? `Observed ${metrics.messagingServiceCount} recent sends via Messaging Service.`
                                : "No recent Messaging Service sends detected in local history."
                        }
                    >
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
                    </FormField>

                    <FormField
                        htmlFor="messagingServiceSid"
                        label="Messaging Service SID"
                        description="Only needed when using Messaging Service mode."
                    >
                        <Input
                            id="messagingServiceSid"
                            name="messagingServiceSid"
                            defaultValue={config.messagingServiceSid ?? ""}
                            placeholder="MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                        />
                    </FormField>

                    <FormField
                        htmlFor="defaultMessageIntent"
                        label="Default MessageIntent"
                        description="Use this when important traffic should be tagged automatically unless callers provide an override."
                    >
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
                    </FormField>

                    <FormField
                        htmlFor="trafficShapingEnabled"
                        label="Priority routing"
                        description="Recommended when urgent notifications should not sit behind bulk campaign traffic."
                    >
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
                    </FormField>
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
                    <FormField
                        htmlFor="trafficClass"
                        label="What kind of traffic is this?"
                        description={
                            detectedTrafficClass !== "unknown"
                                ? `Detected from current numbers: ${formatLabel(detectedTrafficClass)}.`
                                : "No clear sender type detected from current numbers yet."
                        }
                    >
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
                    </FormField>

                    <FormField
                        htmlFor="onboardingStatus"
                        label="Twilio onboarding status"
                        description="Tracks whether parent-account throughput enablement has been planned, requested, or completed."
                    >
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
                    </FormField>

                    <FormField
                        htmlFor="throughputProduct"
                        label="Throughput product"
                        description="Advanced setting. Only applies once Twilio has enabled the parent-account throughput product."
                    >
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
                    </FormField>

                    <FormField
                        htmlFor="multiTenancyMode"
                        label="Multi-Tenancy Mode"
                        description="Advanced setting for how shared parent-account throughput should be distributed across subaccounts."
                    >
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
                    </FormField>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold">Operator context</h3>
                    <p className="text-sm text-muted-foreground">
                        Keep ticket notes and escalation details here so operators understand the current rollout state.
                    </p>
                </div>

                <FormField
                    htmlFor="supportNotes"
                    label="Operator Notes"
                    description="Document carrier constraints, Twilio ticket context, or rollout notes."
                >
                    <Textarea
                        id="supportNotes"
                        name="supportNotes"
                        defaultValue={config.supportNotes}
                        placeholder="Document carrier constraints, Twilio ticket context, or rollout notes."
                    />
                </FormField>
            </div>

            <div className="flex justify-end">
                <Button type="submit">Save Workspace Twilio Setup</Button>
            </div>
        </Form>
    );
}
