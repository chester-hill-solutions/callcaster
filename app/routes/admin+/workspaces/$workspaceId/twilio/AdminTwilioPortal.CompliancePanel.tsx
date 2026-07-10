import { Form } from "react-router";
import { RefreshCw, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { TwilioPageData } from "../loadTwilioData.server";

import { TWILIO_TRUSTHUB_CONSOLE_URL, formatLabel } from "./AdminTwilioPortal.utils";

type CompliancePanelProps = Pick<TwilioPageData["portalSnapshot"], "onboarding" | "syncSnapshot">;

function getApprovalBadgeVariant(status: string) {
    switch (status) {
        case "approved":
        case "live":
            return "secondary" as const;
        case "rejected":
            return "destructive" as const;
        default:
            return "outline" as const;
    }
}

/**
 * Derived "doc needed" signal — there is no dedicated schema flag for this
 * (and Phase H is not allowed to add one to `types.ts`). Instead this reuses
 * the same existing onboarding-state signals Trust Hub / A2P provisioning
 * already writes when a bundle needs manual document action:
 * `a2p10dlc.rejectionReason`, `reviewState.blockingIssues`, and the free-text
 * `emergencyVoice.complianceNotes` field.
 */
function computeDocNeeded(onboarding: CompliancePanelProps["onboarding"]) {
    const reasons: string[] = [];
    if (onboarding.a2p10dlc.status === "rejected") {
        reasons.push("A2P 10DLC brand/campaign was rejected");
    }
    if (onboarding.a2p10dlc.rejectionReason) {
        reasons.push(onboarding.a2p10dlc.rejectionReason);
    }
    if (onboarding.reviewState.blockingIssues.length > 0) {
        reasons.push(...onboarding.reviewState.blockingIssues);
    }
    if (onboarding.emergencyVoice.complianceNotes.trim().length > 0) {
        reasons.push(onboarding.emergencyVoice.complianceNotes.trim());
    }
    return { needed: reasons.length > 0, reasons };
}

export function CompliancePanel({ onboarding, syncSnapshot }: CompliancePanelProps) {
    const { a2p10dlc, reviewState } = onboarding;
    const docNeeded = computeDocNeeded(onboarding);
    const tollFreeBlocked = Boolean(syncSnapshot.tollFreeVerificationBlocked);

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <CardTitle>Compliance</CardTitle>
                        <CardDescription>
                            Trust Hub / A2P 10DLC brand &amp; campaign status, toll-free verification, and any
                            outstanding review issues for this workspace.
                        </CardDescription>
                    </div>
                    <Form method="post">
                        <input type="hidden" name="_action" value="retry_compliance_job" />
                        <Button variant="outline" type="submit" size="sm">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry compliance job
                        </Button>
                    </Form>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">A2P 10DLC status</div>
                        <div className="mt-1">
                            <Badge variant={getApprovalBadgeVariant(a2p10dlc.status)}>
                                {formatLabel(a2p10dlc.status)}
                            </Badge>
                        </div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Trust Hub bundle</div>
                        <div className="mt-1 break-all font-mono text-xs">
                            {a2p10dlc.customerProfileBundleSid ?? "Not created yet"}
                        </div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Trust product</div>
                        <div className="mt-1 break-all font-mono text-xs">
                            {a2p10dlc.trustProductSid ?? "Not created yet"}
                        </div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Toll-free verification</div>
                        <div className="mt-1">
                            <Badge variant={tollFreeBlocked ? "destructive" : "secondary"}>
                                {tollFreeBlocked ? "Blocking bulk SMS" : "Not blocking"}
                            </Badge>
                        </div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Brand SID</div>
                        <div className="mt-1 break-all font-mono text-xs">{a2p10dlc.brandSid ?? "None"}</div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Campaign SID</div>
                        <div className="mt-1 break-all font-mono text-xs">{a2p10dlc.campaignSid ?? "None"}</div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Last submitted</div>
                        <div className="mt-1 text-sm">{a2p10dlc.lastSubmittedAt ?? "Never"}</div>
                    </div>
                    <div className="rounded-lg border p-4">
                        <div className="text-sm text-muted-foreground">Last synced from Twilio</div>
                        <div className="mt-1 text-sm">{a2p10dlc.lastSyncedAt ?? "Never"}</div>
                    </div>
                </div>

                {docNeeded.needed ? (
                    <Alert variant="destructive">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle>Documents / manual action needed</AlertTitle>
                        <AlertDescription>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                                {docNeeded.reasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                ))}
                            </ul>
                            <a
                                className="mt-3 inline-block underline"
                                href={TWILIO_TRUSTHUB_CONSOLE_URL}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Open Trust Hub in Twilio Console to upload documents
                            </a>
                        </AlertDescription>
                    </Alert>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        No outstanding compliance documents flagged for this workspace.
                    </p>
                )}

                {reviewState.lastError ? (
                    <Alert variant="destructive">
                        <AlertTitle>Last compliance job error</AlertTitle>
                        <AlertDescription>{reviewState.lastError}</AlertDescription>
                    </Alert>
                ) : null}

                <div className="text-xs text-muted-foreground">
                    Review state last updated: {reviewState.lastUpdatedAt ?? "Never"}
                </div>
            </CardContent>
        </Card>
    );
}
