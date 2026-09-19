import { useMemo, useState } from "react";
import { Form } from "react-router";
import { Button } from "@/components/ui/button";
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
            <p>
              Toll-free is the higher-volume path and uses your Canadian business
              number (BN) for carrier verification. A local number sends at lower
              volume on the local-number path.
            </p>
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
      </Form>
    </Section>
  );
}
