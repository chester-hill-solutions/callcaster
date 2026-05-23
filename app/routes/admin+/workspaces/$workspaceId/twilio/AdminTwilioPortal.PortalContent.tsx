import { Form } from "react-router";
import { FileText, Image, MessageSquare, Phone, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { groupTwilioUsageData } from "@/lib/twilio-usage";

import type { TwilioPageData } from "../loadTwilioData.server";

import { PortalForm } from "./AdminTwilioPortal.PortalForm";
import {
    TWILIO_RCS_DOCS_URL,
    TWILIO_RCS_PROVIDER,
    TWILIO_RCS_SENDERS_URL,
    buildWorkspaceSummary,
    formatLabel,
    formatStatusLabel,
    getSyncStatusBadgeVariant,
} from "./AdminTwilioPortal.utils";

export function PortalContent({ data }: { data: TwilioPageData }) {
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
                        <FormField htmlFor="rcsStatus" label="RCS status">
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
                        </FormField>
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
