import { Form } from "react-router";
import { FileText, MessageSquare } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { TwilioPageData } from "../loadTwilioData.server";

import {
    TWILIO_RCS_DOCS_URL,
    TWILIO_RCS_PROVIDER,
    TWILIO_RCS_SENDERS_URL,
    formatLabel,
} from "./AdminTwilioPortal.utils";

type OnboardingPanelProps = Pick<TwilioPageData["portalSnapshot"], "onboarding" | "readiness">;

export function OnboardingPanel({ onboarding, readiness }: OnboardingPanelProps) {
    return (
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
    );
}
