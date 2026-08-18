import type { ReactNode } from "react";
import {
  Archive,
  CalendarClock,
  Copy,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CampaignLifecycleState =
  | "running"
  | "waiting"
  | "paused"
  | "archived"
  | "draft"
  | "pending"
  | "scheduled"
  | "complete";

export type LaunchButtonState = "Active" | "Inactive" | "Disabled";

export function getCampaignLaunchButtonStates(
  campaignState: CampaignLifecycleState,
  isPlayDisabled: boolean,
): Record<"play" | "pause" | "archive" | "schedule", LaunchButtonState> {
  const states: Record<
    "play" | "pause" | "archive" | "schedule",
    LaunchButtonState
  > = {
    play: "Disabled",
    pause: "Disabled",
    archive: "Disabled",
    schedule: "Disabled",
  };

  switch (campaignState) {
    case "running":
    case "waiting":
      states.pause = "Inactive";
      states.play = "Active";
      states.schedule = "Disabled";
      states.archive = "Inactive";
      break;
    case "paused":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
      states.schedule = "Inactive";
      states.archive = "Inactive";
      states.pause = "Active";
      break;
    case "draft":
    case "pending":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
      states.pause = "Inactive";
      states.archive = "Inactive";
      states.schedule = isPlayDisabled ? "Disabled" : "Inactive";
      break;
    case "scheduled":
      states.play = isPlayDisabled ? "Disabled" : "Inactive";
      states.pause = "Inactive";
      states.archive = "Inactive";
      states.schedule = "Active";
      break;
    case "complete":
      states.archive = "Inactive";
      break;
    case "archived":
      break;
    default: {
      const _exhaustive: never = campaignState;
      return _exhaustive;
    }
  }

  return states;
}

type LaunchActionButtonProps = {
  label: string;
  icon: ReactNode;
  state: LaunchButtonState;
  busy: boolean;
  /** Prefer this action visually when available (primary CTA). */
  primary?: boolean;
  disabledReason?: string | null;
  onClick: () => void;
  "data-testid"?: string;
};

function LaunchActionButton({
  label,
  icon,
  state,
  busy,
  primary = false,
  disabledReason,
  onClick,
  "data-testid": testId,
}: LaunchActionButtonProps) {
  const isCurrent = state === "Active";
  const isDisabled = state === "Disabled" || isCurrent || busy;

  const variant = isCurrent
    ? "secondary"
    : primary && state === "Inactive"
      ? "default"
      : "outline";

  const button = (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={isDisabled}
      aria-pressed={isCurrent || undefined}
      data-state={state.toLowerCase()}
      data-testid={testId}
      className={cn(
        "min-w-[7.5rem] justify-start",
        isCurrent &&
          "border-border bg-secondary font-semibold text-secondary-foreground",
      )}
      onClick={onClick}
    >
      <span className="mr-1.5 inline-flex shrink-0" aria-hidden>
        {icon}
      </span>
      {label}
    </Button>
  );

  if (!disabledReason || state !== "Disabled") {
    return button;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">{button}</span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{disabledReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export type CampaignLaunchActionsProps = {
  status: string;
  startLabel: string;
  isMessageCampaign: boolean;
  startDisabledReason: string | null;
  scheduleDisabled: string | boolean;
  isBusy: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSchedule: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
};

export function CampaignLaunchActions({
  status,
  startLabel,
  isMessageCampaign,
  startDisabledReason,
  scheduleDisabled,
  isBusy,
  onPlay,
  onPause,
  onSchedule,
  onArchive,
  onDuplicate,
}: CampaignLaunchActionsProps) {
  const buttonStates = getCampaignLaunchButtonStates(
    status as CampaignLifecycleState,
    Boolean(startDisabledReason),
  );
  const scheduleState: LaunchButtonState =
    scheduleDisabled && buttonStates.schedule !== "Active"
      ? "Disabled"
      : buttonStates.schedule;

  const scheduleReason =
    typeof scheduleDisabled === "string" ? scheduleDisabled : null;
  const playLabel =
    buttonStates.play === "Active"
      ? isMessageCampaign
        ? "Sending"
        : "Running"
      : isMessageCampaign
        ? "Send now"
        : startLabel;
  const pauseLabel = buttonStates.pause === "Active" ? "Paused" : "Pause";
  const scheduleLabel =
    scheduleState === "Active" ? "Scheduled" : "Schedule";

  return (
    <div className="space-y-3" data-testid="campaign-readiness">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Campaign lifecycle"
        >
          <LaunchActionButton
            label={playLabel}
            icon={<Play className="size-4" />}
            state={buttonStates.play}
            busy={isBusy}
            primary
            disabledReason={startDisabledReason}
            onClick={onPlay}
            data-testid="campaign-launch-play"
          />
          <LaunchActionButton
            label={pauseLabel}
            icon={<Pause className="size-4" />}
            state={buttonStates.pause}
            busy={isBusy}
            primary={buttonStates.play === "Active"}
            onClick={onPause}
            data-testid="campaign-launch-pause"
          />
          <LaunchActionButton
            label={scheduleLabel}
            icon={<CalendarClock className="size-4" />}
            state={scheduleState}
            busy={isBusy}
            disabledReason={scheduleReason}
            onClick={onSchedule}
            data-testid="campaign-launch-schedule"
          />
        </div>
        <div
          className="flex flex-wrap gap-2 sm:justify-end"
          role="group"
          aria-label="Campaign utilities"
        >
          <LaunchActionButton
            label="Archive"
            icon={<Archive className="size-4" />}
            state={buttonStates.archive}
            busy={isBusy}
            onClick={onArchive}
            data-testid="campaign-launch-archive"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isBusy}
            className="min-w-[7.5rem] justify-start"
            onClick={onDuplicate}
            data-testid="campaign-launch-duplicate"
          >
            <Copy className="mr-1.5 size-4" aria-hidden />
            Duplicate
          </Button>
        </div>
      </div>
    </div>
  );
}
