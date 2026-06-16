import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { TwilioPageData } from "../loadTwilioData.server";

import { PortalForm } from "./AdminTwilioPortal.PortalForm";
import { buildWorkspaceSummary, formatLabel, getSyncStatusBadgeVariant } from "./AdminTwilioPortal.utils";

type SendingSetupPanelProps = Pick<
    TwilioPageData["portalSnapshot"],
    "config" | "effectiveConfig" | "detectedTrafficClass" | "metrics" | "syncSnapshot"
>;

export function SendingSetupPanel({ config, effectiveConfig, detectedTrafficClass, metrics, syncSnapshot }: SendingSetupPanelProps) {
    return (
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
                            {effectiveConfig.sendMode === "messaging_service" ? "Messaging Service" : "Phone number"}
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

                <PortalForm
                    config={config}
                    effectiveConfig={effectiveConfig}
                    detectedTrafficClass={detectedTrafficClass}
                    metrics={metrics}
                />
            </CardContent>
        </Card>
    );
}
