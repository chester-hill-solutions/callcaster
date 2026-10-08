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
  WorkspaceMessagingOnboardingState,
  WorkspaceOperatingCountry,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { GOAL_OPTIONS } from "./constants";
import type { OnboardingStepProps } from "./types";

type SmsNumberPath = "local" | "toll_free";
export type GoalSelection = { goal: WorkspaceOnboardingGoal | null; numberPath: SmsNumberPath | null };

export function readSmsNumberPath(onboarding: Pick<WorkspaceMessagingOnboardingState, "selectedGoal" | "selectedChannels">): SmsNumberPath | null {
  if (onboarding.selectedGoal !== "sms_blast") return null;
  if (onboarding.selectedChannels.includes("toll_free_bulk_sms")) return "toll_free";
  if (onboarding.selectedChannels.includes("local_number")) return "local";
  return null;
}

export function isGoalSelectionValid(goal: WorkspaceOnboardingGoal | null, country: WorkspaceOperatingCountry, path: SmsNumberPath | null): boolean {
  return goal !== "sms_blast" ||
    !channelsForOnboardingGoal(goal, country).includes("toll_free_bulk_sms") ||
    path !== null;
}

export function readGoalSelection(onboarding: Pick<WorkspaceMessagingOnboardingState, "selectedGoal" | "selectedChannels">): GoalSelection {
  return { goal: onboarding.selectedGoal, numberPath: readSmsNumberPath(onboarding) };
}

type GoalStepProps = Pick<OnboardingStepProps, "onboarding" | "isReadOnly" | "pending"> & { formId?: string };

export function OnboardingGoalStep(props: GoalStepProps) {
  const [selection, setSelection] = useState(() => readGoalSelection(props.onboarding));
  return <OnboardingGoalForm {...props} selection={selection} onSelectionChange={setSelection} />;
}

export function OnboardingGoalForm({
  formId = "onboarding-channels-form", onboarding, isReadOnly, selection, onSelectionChange,
}: GoalStepProps & {
  selection: GoalSelection;
  onSelectionChange: (selection: GoalSelection) => void;
}) {
  const { goal: selectedGoal, numberPath: smsNumberPath } = selection;

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

  const selectNumberPath = (path: SmsNumberPath) => {
    onSelectionChange({ goal: selectedGoal, numberPath: path });
  };

  return (
    <Section variant="flat">
      <SectionHeader
        compact
        title="What are you setting up?"
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
                    onSelectionChange({ goal: option.id, numberPath: null });
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
                  onClick={() => selectNumberPath("toll_free")}
                  disabled={isReadOnly}
                >
                  Set Up Toll Free (BN required)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-pressed={smsNumberPath === "local"}
                  onClick={() => selectNumberPath("local")}
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
