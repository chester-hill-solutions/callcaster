import { Form } from "react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "@/components/shared/Section";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";
import { goalNeedsSmsCompliance } from "@/lib/messaging-onboarding/goals";

type SmsComplianceGateProps = {
  workspaceId: string;
  onboarding: WorkspaceMessagingOnboardingState;
  isReadOnly?: boolean;
};

/**
 * Capability gate for TFV / A2P fields when the workspace goal needs SMS
 * compliance. Saved via `save_business_profile` with existing profile merge.
 */
export function SmsComplianceGate({
  workspaceId,
  onboarding,
  isReadOnly = false,
}: SmsComplianceGateProps) {
  if (!goalNeedsSmsCompliance(onboarding.selectedGoal)) {
    return null;
  }

  const profile = onboarding.businessProfile;
  const channels = onboarding.selectedChannels;
  const showTollFree = channels.includes("toll_free_bulk_sms");
  const showA2p = channels.includes("a2p10dlc");

  if (!showTollFree && !showA2p) {
    return null;
  }

  return (
    <Section variant="flat" data-testid="sms-compliance-gate">
      <SectionHeader
        compact
        title="SMS compliance details"
        description="Required before toll-free or US A2P registration can proceed for this workspace."
      />
      <Form
        method="post"
        action={`/workspaces/${workspaceId}/onboarding`}
        className="space-y-4"
      >
        <input type="hidden" name="_action" value="save_business_profile" />
        <input
          type="hidden"
          name="returnTo"
          value={`/workspaces/${workspaceId}/settings/numbers`}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="legalBusinessName">Legal business name</Label>
            <Input
              id="legalBusinessName"
              name="legalBusinessName"
              defaultValue={profile.legalBusinessName}
              disabled={isReadOnly}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL</Label>
            <Input
              id="websiteUrl"
              name="websiteUrl"
              type="url"
              defaultValue={profile.websiteUrl}
              disabled={isReadOnly}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="useCaseSummary">Use case summary</Label>
            <Textarea
              id="useCaseSummary"
              name="useCaseSummary"
              defaultValue={profile.useCaseSummary}
              disabled={isReadOnly}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="sampleMessages">Sample messages</Label>
            <Textarea
              id="sampleMessages"
              name="sampleMessages"
              defaultValue={profile.sampleMessages.join("\n")}
              disabled={isReadOnly}
              required
            />
          </div>
        </div>

        {showTollFree ? (
          <div className="grid gap-4 border-t border-border/60 pt-4 md:grid-cols-2">
            <p className="md:col-span-2 text-sm font-medium">
              Toll-free verification
            </p>
            <p className="md:col-span-2 text-sm text-muted-foreground">
              Toll-free setup requires a Canadian business number (BN) for carrier approval.
            </p>
            <div className="space-y-2">
              <Label htmlFor="doingBusinessAs">Doing business as (DBA)</Label>
              <Input
                id="doingBusinessAs"
                name="doingBusinessAs"
                defaultValue={profile.doingBusinessAs}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessRegistrationNumber">
                Business registration number (BN){" "}
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </Label>
              <Input
                id="businessRegistrationNumber"
                name="businessRegistrationNumber"
                defaultValue={profile.businessRegistrationNumber}
                disabled={isReadOnly}
                required
                aria-required
                placeholder="123456789RC0001"
              />
              <p className="text-xs text-muted-foreground">
                Required to set up toll-free SMS. Your CRA business number (9 digits + RC +
                account).
              </p>
            </div>
          </div>
        ) : null}

        {showA2p ? (
          <div className="grid gap-4 border-t border-border/60 pt-4 md:grid-cols-2">
            <p className="md:col-span-2 text-sm font-medium">
              US brand registration
            </p>
            <div className="space-y-2">
              <Label htmlFor="ein">EIN (US tax ID)</Label>
              <Input
                id="ein"
                name="ein"
                defaultValue={profile.ein}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                name="industry"
                defaultValue={profile.industry}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="authorizedRepName">Authorized representative</Label>
              <Input
                id="authorizedRepName"
                name="authorizedRepName"
                defaultValue={profile.authorizedRepName}
                disabled={isReadOnly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="authorizedRepEmail">Representative email</Label>
              <Input
                id="authorizedRepEmail"
                name="authorizedRepEmail"
                type="email"
                defaultValue={profile.authorizedRepEmail}
                disabled={isReadOnly}
              />
            </div>
          </div>
        ) : null}

        {!isReadOnly ? (
          <Button type="submit">Save SMS compliance details</Button>
        ) : null}
      </Form>
    </Section>
  );
}
