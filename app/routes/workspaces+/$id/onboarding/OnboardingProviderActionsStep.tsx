import { Form } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isRcsOnboardingEnabled } from "@/lib/rcs-onboarding-flags";
import { TWILIO_RCS_DOCS_URL, TWILIO_RCS_PROVIDER, TWILIO_RCS_SENDERS_URL } from "./constants";
import type { OnboardingProviderActionsProps } from "./types";

export function OnboardingProviderActionsStep({
  onboarding,
  rcsBlockingIssues,
  isReadOnly,
  pending,
  a2pBlockingIssues,
  a2pErrors,
}: OnboardingProviderActionsProps) {
  const { isSavingRcs, isAttachingRcsSender } = pending;
  const showRcsOnboarding = isRcsOnboardingEnabled();
  const showTollFree = onboarding.selectedChannels.includes("toll_free_bulk_sms");
  const showA2p = onboarding.selectedChannels.includes("a2p10dlc");
  const reviewIssues = onboarding.reviewState.blockingIssues;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider setup</CardTitle>
        <CardDescription>
          Provider registrations for the compliance paths you selected are submitted automatically. This page shows
          their live status — review can take several days.
        </CardDescription>
      </CardHeader>
      <CardContent className={showRcsOnboarding ? "grid gap-6 xl:grid-cols-2" : "grid gap-6"}>
        {!showTollFree && !showA2p && !showRcsOnboarding ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            No compliance provider paths were selected, so there is nothing to register here. You can enable toll-free
            bulk SMS or US A2P 10DLC on the Channels step if you need them.
          </div>
        ) : null}
        {showTollFree ? (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Toll-free bulk SMS verification</div>
              <Badge
                variant={
                  onboarding.a2p10dlc.status === "approved" || onboarding.a2p10dlc.status === "live"
                    ? "secondary"
                    : "outline"
                }
              >
                {onboarding.a2p10dlc.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              High-volume SMS to Canadian mobiles runs over a verified toll-free number. Once you have a toll-free
              number, we submit the Twilio toll-free verification for you using the details from the Channels step —
              no manual step required.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Verification status</div>
                <div className="mt-1 font-medium capitalize">
                  {onboarding.a2p10dlc.status.replaceAll("_", " ")}
                </div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Last updated</div>
                <div className="mt-1 text-sm">
                  {onboarding.a2p10dlc.lastSyncedAt ?? "Not submitted yet"}
                </div>
              </div>
            </div>
            {reviewIssues.length > 0 ? (
              <div className="rounded-lg border p-4 text-sm">
                <div className="font-medium">Waiting on a few items before verification can complete.</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {reviewIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {showA2p ? (
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
              Brand SID: {onboarding.a2p10dlc.brandSid ?? "Not created"}. Campaign SID:{" "}
              {onboarding.a2p10dlc.campaignSid ?? "Not created"}.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              A2P 10DLC is primarily a US registration path for application-to-person SMS sent over US 10-digit
              long-code numbers. Brand and campaign registration are submitted automatically once the required
              details are in place.
            </p>
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
              <div className="mt-1 font-mono text-sm">{onboarding.a2p10dlc.brandSid ?? "Not created"}</div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Campaign registration</div>
              <div className="mt-1 font-mono text-sm">{onboarding.a2p10dlc.campaignSid ?? "Not created"}</div>
            </div>
          </div>
        </div>
        ) : null}
        {showRcsOnboarding ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-3">
            <div className="font-medium">Twilio RCS sender onboarding</div>
            <p className="text-sm text-muted-foreground">
              Twilio does not offer a public API to create or approve RCS senders — creating the sender and passing
              Google/carrier compliance review still happens in Twilio Console. Save the sender package here to keep
              a record and pre-fill Console fields, submit the sender in Console, then paste the resulting Sender SID
              (starts with &quot;XE&quot;) back into the field below once it&apos;s approved. From there, attaching
              it to this workspace&apos;s Messaging Service sender pool is automatic — no further Console step is
              required.
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
            Twilio will also reuse the business basics already saved above. When those fields are present, this RCS
            draft auto-fills the display name, description, support email, and default region for you.
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
          {!isReadOnly && onboarding.rcs.senderId ? (
            <Form method="post">
              <input type="hidden" name="_action" value="attach_rcs_sender" />
              <Button type="submit" variant="outline" disabled={isAttachingRcsSender} aria-busy={isAttachingRcsSender}>
                {isAttachingRcsSender
                  ? "Attaching RCS sender..."
                  : "Attach RCS sender to Messaging Service pool"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Adds sender {onboarding.rcs.senderId} to the Messaging Service&apos;s sender pool via the Twilio
                ChannelSenders API. Safe to run again — it no-ops if already attached.
              </p>
            </Form>
          ) : null}
        </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
