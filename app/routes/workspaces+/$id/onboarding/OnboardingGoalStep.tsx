import { useMemo, useState } from "react";
import { Form } from "react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Section, SectionHeader } from "@/components/shared/Section";
import {
  channelsForOnboardingGoal,
  goalNeedsSmsCompliance,
} from "@/lib/messaging-onboarding/goals";
import type { WorkspaceOnboardingGoal } from "@/lib/types";
import { GOAL_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";

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

  const derivedChannels = useMemo(() => {
    if (!selectedGoal) return [] as string[];
    return channelsForOnboardingGoal(selectedGoal, onboarding.operatingCountry);
  }, [selectedGoal, onboarding.operatingCountry]);

  const showSmsCompliance = goalNeedsSmsCompliance(selectedGoal);
  const showTollFreeFields =
    showSmsCompliance && derivedChannels.includes("toll_free_bulk_sms");
  const showA2pFields = showSmsCompliance && derivedChannels.includes("a2p10dlc");

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
          {derivedChannels.map((channel) => (
            <input key={channel} type="hidden" name="selectedChannels" value={channel} />
          ))}

          <TooltipProvider>
            <div className="space-y-3" role="radiogroup" aria-label="Onboarding goal">
              {GOAL_OPTIONS.map((option) => {
                const checked = selectedGoal === option.id;
                return (
                  <div
                    key={option.id}
                    className={
                      checked
                        ? "flex items-start gap-3 rounded-lg border border-primary/50 ring-1 ring-primary/30 p-4"
                        : "flex items-start gap-3 rounded-lg border p-4"
                    }
                  >
                    <input
                      id={`goal-${option.id}`}
                      type="radio"
                      name="goalChoice"
                      value={option.id}
                      checked={checked}
                      onChange={() => setSelectedGoal(option.id)}
                      disabled={isReadOnly}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label htmlFor={`goal-${option.id}`} className="font-medium">
                        {option.label}
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedGoal === "sms_blast" ? (
              <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
                <p>
                  For texting at higher volume, a toll-free number is usually the smoother path. A
                  local number can send texts too, at a lower throughput.
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="mt-2 text-xs font-medium underline">
                      Why this matters
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Carriers apply different sending limits by number type. Toll-free numbers support
                    higher-volume outreach once verification finishes.
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : null}
          </TooltipProvider>

          {showTollFreeFields ? (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <p className="text-sm font-medium">Toll-free verification details</p>
              <p className="text-sm text-muted-foreground">
                These details help carriers approve higher-volume texting on a toll-free number.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="doingBusinessAs">Doing business as (DBA)</Label>
                  <Input
                    id="doingBusinessAs"
                    name="doingBusinessAs"
                    placeholder="Acme Health"
                    defaultValue={profile.doingBusinessAs}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessRegistrationNumber">
                    Business registration number (BN)
                  </Label>
                  <Input
                    id="businessRegistrationNumber"
                    name="businessRegistrationNumber"
                    placeholder="123456789RC0001"
                    defaultValue={profile.businessRegistrationNumber}
                    disabled={isReadOnly}
                  />
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
            </div>
          ) : null}

          {showA2pFields ? (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <p className="text-sm font-medium">US brand registration details</p>
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
            </div>
          ) : null}
      </Form>
    </Section>
  );
}
