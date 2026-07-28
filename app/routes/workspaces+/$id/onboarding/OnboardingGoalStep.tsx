import { useMemo, useState } from "react";
import { Form } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import InfoPopover from "@/components/shared/InfoPopover";
import { Section, SectionHeader } from "@/components/shared/Section";
import {
  channelsForOnboardingGoal,
  goalNeedsSmsCompliance,
} from "@/lib/messaging-onboarding/goals";
import type {
  WorkspaceOnboardingChannel,
  WorkspaceOnboardingGoal,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { GOAL_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";

type SmsNumberPath = "local" | "toll_free";

export function OnboardingGoalStep({
  formId = "onboarding-channels-form",
  onboarding,
  isReadOnly,
}: Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & {
  formId?: string;
}) {
  const profile = onboarding.businessProfile;
  const [selectedGoal, setSelectedGoal] = useState<WorkspaceOnboardingGoal | null>(
    () => onboarding.selectedGoal,
  );
  const [smsNumberPath, setSmsNumberPath] = useState<SmsNumberPath | null>(() => {
    if (onboarding.selectedGoal !== "sms_blast") return null;
    if (onboarding.selectedChannels.includes("toll_free_bulk_sms")) return "toll_free";
    if (onboarding.selectedChannels.includes("local_number")) return "local";
    return null;
  });

  const derivedChannels = useMemo<WorkspaceOnboardingChannel[]>(() => {
    if (!selectedGoal) return [];
    return channelsForOnboardingGoal(selectedGoal, onboarding.operatingCountry);
  }, [selectedGoal, onboarding.operatingCountry]);

  const showSmsCompliance = goalNeedsSmsCompliance(selectedGoal);
  const offersTollFree =
    showSmsCompliance && derivedChannels.includes("toll_free_bulk_sms");
  // Swap toll-free for a local number when the customer opts out of toll-free setup.
  const submittedChannels = useMemo<WorkspaceOnboardingChannel[]>(() => {
    if (!offersTollFree || smsNumberPath !== "local") return derivedChannels;
    return derivedChannels.map((channel) =>
      channel === "toll_free_bulk_sms" ? "local_number" : channel,
    );
  }, [derivedChannels, offersTollFree, smsNumberPath]);

  const showTollFreeFields = offersTollFree && smsNumberPath === "toll_free";
  const showA2pFields = showSmsCompliance && submittedChannels.includes("a2p10dlc");

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="What are you setting up?"
        description="Pick the outcome you want first. Setup steps adapt to that goal so you can launch sooner."
      />
      <Form id={formId} method="post" className="space-y-4">
          <input type="hidden" name="_action" value="save_channels" />
          {selectedGoal ? (
            <input type="hidden" name="selectedGoal" value={selectedGoal} />
          ) : null}
          {submittedChannels.map((channel) => (
            <input key={channel} type="hidden" name="selectedChannels" value={channel} />
          ))}

            <fieldset className="space-y-3">
              <legend className="sr-only">Onboarding goal</legend>
              {GOAL_OPTIONS.map((option) => {
                const checked = selectedGoal === option.id;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md p-3 transition-colors",
                      checked
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : "bg-muted/40 hover:bg-muted/60",
                      isReadOnly && "cursor-default",
                    )}
                  >
                    <input
                      type="radio"
                      name="goalChoice"
                      value={option.id}
                      checked={checked}
                      onChange={() => {
                        setSelectedGoal(option.id);
                        setSmsNumberPath(null);
                      }}
                      disabled={isReadOnly}
                      className="mt-1"
                    />
                    <span className="flex-1 font-medium">
                      {option.label}
                      <span className="mt-1 block text-sm font-normal text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {selectedGoal === "sms_blast" ? (
              <div className="space-y-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    <InfoPopover
                      size={16}
                      tooltip="Toll-free SMS verification requires your CRA business number (BN). Local numbers skip that verification and send at lower volume."
                    />
                  </span>
                  <p>
                    Toll-free is the higher-volume path, and it requires a Canadian business
                    number (BN) for carrier verification. A local number can send texts at lower
                    throughput without a BN.
                  </p>
                </div>
                {offersTollFree ? (
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="SMS number path"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-pressed={smsNumberPath === "toll_free"}
                      onClick={() => setSmsNumberPath("toll_free")}
                      disabled={isReadOnly}
                    >
                      Set Up Toll Free (BN required)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-pressed={smsNumberPath === "local"}
                      onClick={() => setSmsNumberPath("local")}
                      disabled={isReadOnly}
                    >
                      Continue with Local Number
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

          {showTollFreeFields ? (
            <fieldset className="space-y-4 border-t border-border/60 pt-4">
              <legend className="text-sm font-medium">Toll-free verification details</legend>
              <p className="text-sm text-muted-foreground">
                Toll-free setup requires your CRA business number (BN). Carriers use it to
                approve higher-volume texting on a toll-free number.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doingBusinessAs">Doing business as (DBA)</Label>
                  <Input
                    id="doingBusinessAs"
                    name="doingBusinessAs"
                    placeholder="Acme Health"
                    defaultValue={profile.doingBusinessAs || profile.legalBusinessName}
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
                    placeholder="123456789RC0001"
                    defaultValue={profile.businessRegistrationNumber}
                    disabled={isReadOnly}
                    required
                    aria-required
                  />
                  <p className="text-xs text-muted-foreground">
                    Required to set up toll-free. Use your CRA business number (9 digits + RC +
                    account), from your CRA documents.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <input type="hidden" name="ageGatedContent" value="false" />
                <input
                  id="ageGatedContent"
                  type="checkbox"
                  name="ageGatedContent"
                  value="true"
                  defaultChecked={profile.ageGatedContent}
                  disabled={isReadOnly}
                />
                <div>
                  <Label htmlFor="ageGatedContent" className="font-medium">
                    Age-gated content
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Check this when messages include age-restricted content such as alcohol or
                    gambling.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channelSampleMessages">Sample messages</Label>
                <Textarea
                  id="channelSampleMessages"
                  name="channelSampleMessages"
                  placeholder={"One sample message per line.\nInclude opt-out language where relevant."}
                  defaultValue={profile.sampleMessages.join("\n")}
                  disabled={isReadOnly}
                />
              </div>
            </fieldset>
          ) : null}

          {showA2pFields ? (
            <fieldset className="space-y-4 border-t border-border/60 pt-4">
              <legend className="text-sm font-medium">US brand registration details</legend>
              <p className="text-sm text-muted-foreground">
                Needed for application-to-person texting on US local numbers.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ein">EIN (US tax ID)</Label>
                  <Input
                    id="ein"
                    name="ein"
                    placeholder="12-3456789"
                    defaultValue={profile.ein}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    name="industry"
                    placeholder="Healthcare"
                    defaultValue={profile.industry}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authorizedRepName">Authorized representative name</Label>
                  <Input
                    id="authorizedRepName"
                    name="authorizedRepName"
                    placeholder="Jordan Smith"
                    defaultValue={profile.authorizedRepName}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authorizedRepTitle">Authorized representative title</Label>
                  <Input
                    id="authorizedRepTitle"
                    name="authorizedRepTitle"
                    placeholder="Head of Operations"
                    defaultValue={profile.authorizedRepTitle}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authorizedRepEmail">Authorized representative email</Label>
                  <Input
                    id="authorizedRepEmail"
                    name="authorizedRepEmail"
                    type="email"
                    placeholder="jordan@acmehealth.com"
                    defaultValue={profile.authorizedRepEmail}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authorizedRepPhone">Authorized representative phone</Label>
                  <Input
                    id="authorizedRepPhone"
                    name="authorizedRepPhone"
                    placeholder="+1 555 123 4567"
                    defaultValue={profile.authorizedRepPhone}
                    disabled={isReadOnly}
                  />
                </div>
              </div>
            </fieldset>
          ) : null}
      </Form>
    </Section>
  );
}
