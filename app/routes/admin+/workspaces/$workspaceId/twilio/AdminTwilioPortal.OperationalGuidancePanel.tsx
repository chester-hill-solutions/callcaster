import { Form } from "react-router";
import { RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { TwilioPageData } from "../loadTwilioData.server";

import { formatLabel } from "./AdminTwilioPortal.utils";

type OperationalGuidancePanelProps = Pick<
    TwilioPageData["portalSnapshot"],
    "config" | "detectedTrafficClass" | "recommendations" | "supportRequestSummary"
>;

function getRecommendationAlertVariant(severity: TwilioPageData["portalSnapshot"]["recommendations"][number]["severity"]) {
    switch (severity) {
        case "warning":
            return "destructive" as const;
        case "info":
            return "default" as const;
        default: {
            const exhaustiveCheck: never = severity;
            return exhaustiveCheck;
        }
    }
}

function getRecommendationAlertTitle(severity: TwilioPageData["portalSnapshot"]["recommendations"][number]["severity"]) {
    switch (severity) {
        case "warning":
            return "Warning";
        case "info":
            return "Recommendation";
        default: {
            const exhaustiveCheck: never = severity;
            return exhaustiveCheck;
        }
    }
}

export function OperationalGuidancePanel({
    config,
    detectedTrafficClass,
    recommendations,
    supportRequestSummary,
}: OperationalGuidancePanelProps) {
    return (
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
                            <Alert
                                key={`${recommendation.message}-${index}`}
                                variant={getRecommendationAlertVariant(recommendation.severity)}
                            >
                                <AlertTitle>{getRecommendationAlertTitle(recommendation.severity)}</AlertTitle>
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
    );
}
