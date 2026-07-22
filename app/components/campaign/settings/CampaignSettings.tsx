import { useEffect } from "react";
import { FetcherWithComponents, Form, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Audience,
  Campaign,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Script,
  Survey,
  User,
  WorkspaceNumbers,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
  FileObject,
} from "@/lib/types";
import { CampaignBasicInfo } from "./basic/CampaignBasicInfo";
import { CampaignTypeSpecificSettings } from "./detailed/CampaignDetailed";
import { CampaignLaunchExtras } from "./detailed/CampaignLaunchExtras";
import { SaveBar } from "@/components/shared/SaveBar";
import { Section, SectionHeader } from "@/components/shared/Section";
import { CampaignSettingsQueue } from "./CampaignSettingsQueue";
import { CampaignCostPanel } from "./CampaignCostPanel";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";
import {
  formatCredits,
  formatCurrency,
  CREDIT_PRICE_CAD,
} from "@/lib/billing-format";
import { productGoalForCampaignType } from "@/lib/campaign-goals";
import type { CampaignType } from "@/lib/db-types";
import { AlertCircle } from "lucide-react";

type CampaignState =
  | "running"
  | "paused"
  | "archived"
  | "draft"
  | "pending"
  | "scheduled"
  | "complete";

type ButtonState = "Active" | "Inactive" | "Disabled";

function getButtonStates(
  campaignState: CampaignState,
  isPlayDisabled: boolean,
): Record<"play" | "pause" | "archive" | "schedule", ButtonState> {
  const states: Record<"play" | "pause" | "archive" | "schedule", ButtonState> = {
    play: "Disabled",
    pause: "Disabled",
    archive: "Disabled",
    schedule: "Disabled",
  };

  switch (campaignState) {
    case "running":
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

function launchActionLabel(type: Campaign["type"] | null | undefined): string {
  if (!type) return "Start campaign";
  const goal = productGoalForCampaignType(type as CampaignType);
  switch (goal) {
    case "live_calling":
      return "Start calling";
    case "text_campaign":
      return "Start text campaign";
    case "automated_phone_menu":
      return "Start phone menu";
    case null:
      return "Start campaign";
    default: {
      const _exhaustive: never = goal;
      return _exhaustive;
    }
  }
}

export type CampaignSettingsProps = {
  campaignData: Campaign;
  campaignDetails: LiveCampaign | MessageCampaign | IVRCampaign;
  flags: Flags;
  workspace: string;
  isActive: boolean;
  scripts: Script[];
  audiences: Audience[];
  mediaData: FileObject[];
  campaign_id: string;
  isChanged: boolean;
  phoneNumbers: WorkspaceNumbers[];
  handleInputChange: (name: string, value: unknown) => void;
  handleDuplicateButton: () => void;
  handleStatusButton: (type: "play" | "pause" | "archive" | "schedule") => void;
  handleScheduleButton: () => void;
  handleSave?: () => void;
  handleResetData?: () => void;
  formFetcher: FetcherWithComponents<unknown>;
  user: User;
  startDisabledReason: string | null;
  readinessIssues: string[];
  queueCount: number;
  dequeuedCount: number;
  totalCount: number;
  mediaLinks: string[];
  handleNavigate: (e: React.MouseEvent<HTMLButtonElement>) => void;
  scheduleDisabled: string | boolean;
  handleConfirmStatus: (status: "play" | "archive" | "none") => void;
  confirmStatus: "play" | "archive" | "none";
  isBusy: boolean;
  isSaving: boolean;
  activeIntent: string | null;
  feedbackMessage?: string | null;
  feedbackTone?: "success" | "error" | null;
  credits: number;
  surveys: Pick<Survey, "survey_id" | "title">[];
  outboundEstimateInputs: {
    portalConfig: WorkspaceTwilioOpsConfig;
    syncSnapshot: WorkspaceTwilioSyncSnapshot;
  };
  smsSendContext?: {
    messagingServiceReady: boolean;
    defaultMessagingServiceSid: string | null;
    attachedSenderPhoneNumbers: string[];
  };
  campaignBilling?: CampaignBillingSummary | null;
  launchActionLabelOverride?: string;
};

export const CampaignSettings = ({
  campaignData,
  campaignDetails,
  mediaData,
  isChanged = false,
  phoneNumbers = [],
  credits,
  handleInputChange,
  handleSave,
  handleResetData,
  handleScheduleButton,
  handleStatusButton,
  handleDuplicateButton,
  formFetcher,
  scripts,
  startDisabledReason,
  readinessIssues,
  flags,
  queueCount,
  dequeuedCount,
  totalCount,
  scheduleDisabled,
  handleConfirmStatus,
  confirmStatus,
  isBusy,
  isSaving,
  activeIntent,
  feedbackMessage,
  feedbackTone,
  outboundEstimateInputs,
  smsSendContext,
  campaignBilling = null,
  launchActionLabelOverride,
}: CampaignSettingsProps) => {
  const location = useLocation();
  const startLabel =
    launchActionLabelOverride ?? launchActionLabel(campaignData.type);

  const confirmActionLabel =
    confirmStatus === "play"
      ? activeIntent === "status" && isBusy
        ? "Starting..."
        : startLabel
      : activeIntent === "status" && isBusy
        ? "Archiving..."
        : "Archive campaign";

  const selectedScriptId =
    campaignDetails && "script_id" in campaignDetails
      ? campaignDetails.script_id
      : campaignData.script_id;
  const selectedScript = scripts.find(
    (script) => String(script.id) === String(selectedScriptId),
  );
  const contentSummary =
    campaignData.type === "message"
      ? campaignDetails &&
        "body_text" in campaignDetails &&
        campaignDetails.body_text?.trim()
        ? campaignDetails.body_text.trim()
        : campaignDetails &&
            "message_media" in campaignDetails &&
            campaignDetails.message_media?.length
          ? "Message with media"
          : "Add message content"
      : selectedScript?.name ??
        (selectedScriptId ? `Script ${selectedScriptId}` : "Select a script");
  const numberSummary =
    campaignData.type === "message" &&
    campaignData.sms_send_mode === "messaging_service"
      ? "Messaging service"
      : campaignData.caller_id || "Select a number";
  const formatReviewDate = (value: string | null | undefined) => {
    if (!value) return "Set a date";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "Set a date"
      : parsed.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  };
  const scheduleValue =
    typeof campaignData.schedule === "string"
      ? (() => {
          try {
            return JSON.parse(campaignData.schedule) as unknown;
          } catch {
            return null;
          }
        })()
      : campaignData.schedule;
  const activeScheduleDays =
    scheduleValue && typeof scheduleValue === "object"
      ? Object.values(scheduleValue).filter(
          (day) =>
            day &&
            typeof day === "object" &&
            "active" in day &&
            day.active === true,
        ).length
      : 0;
  const estimatedCredits = campaignBilling?.estimate.totalCredits ?? queueCount;

  const buttonStates = getButtonStates(
    campaignData.status as CampaignState,
    Boolean(startDisabledReason),
  );

  useEffect(() => {
    if (location.hash !== "#campaign-launch") return;
    document.getElementById("campaign-launch")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [location.hash]);

  const startReview = (
    <div className="space-y-4" data-testid="campaign-launch-review">
      <dl className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Outbound number
          </dt>
          <dd className="mt-1 text-sm">{numberSummary}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Content
          </dt>
          <dd className="mt-1 line-clamp-2 text-sm">{contentSummary}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Schedule
          </dt>
          <dd className="mt-1 text-sm">
            {formatReviewDate(campaignData.start_date)}–
            {formatReviewDate(campaignData.end_date)}
            {activeScheduleDays > 0
              ? ` · ${activeScheduleDays} active day${activeScheduleDays === 1 ? "" : "s"}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Queue
          </dt>
          <dd className="mt-1 text-sm">{queueCount.toLocaleString()} contacts</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Credits
          </dt>
          <dd className="mt-1 text-sm">{formatCredits(credits || 0)} available</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Estimate
          </dt>
          <dd className="mt-1 text-sm">
            {formatCredits(estimatedCredits)} credits (
            {formatCurrency(estimatedCredits * CREDIT_PRICE_CAD)})
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {campaignBilling?.estimate.rateDescription ??
          (campaignData.type === "message"
            ? "SMS usage is estimated by message segment."
            : "Voice usage is estimated from the configured campaign rate.")}
      </p>
      {readinessIssues.length > 0 ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">Complete before launch</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
            {readinessIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
          Ready to launch.
        </p>
      )}
    </div>
  );

  return (
    <>
      <Dialog
        open={confirmStatus !== "none"}
        onOpenChange={(open) => {
          if (!open) {
            handleConfirmStatus("none");
          }
        }}
      >
        <DialogContent className="bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>
              {confirmStatus === "play"
                ? "Review campaign launch"
                : confirmStatus === "archive"
                  ? "Archive campaign"
                  : ""}
            </DialogTitle>
            <DialogDescription>
              {confirmStatus === "play"
                ? "Confirm the campaign setup, audience, and estimated usage."
                : "Archive this campaign and move it out of the active campaign list."}
            </DialogDescription>
          </DialogHeader>
          {confirmStatus === "play" ? startReview : null}
          {confirmStatus === "archive" ? (
            <p className="text-sm text-muted-foreground">
              You can restore it later from the archived campaigns page.
            </p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => handleConfirmStatus("none")}
              className="mr-2"
              variant="outline"
              disabled={isBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleConfirmStatus(confirmStatus)}
              variant={confirmStatus === "archive" ? "destructive" : "default"}
              disabled={
                isBusy || (confirmStatus === "play" && readinessIssues.length > 0)
              }
            >
              {confirmActionLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        id="campaignSettingsContainer"
        className="flex h-full min-w-0 flex-col gap-8 p-4 sm:p-6"
        role="region"
        aria-label="Campaign setup"
      >
        {handleSave && handleResetData && (
          <SaveBar
            isChanged={isChanged || false}
            isSaving={isSaving}
            onSave={handleSave}
            onReset={handleResetData}
            message="Unsaved changes. Save before starting or scheduling."
          />
        )}
        {feedbackMessage && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              feedbackTone === "error"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
            }`}
            role={feedbackTone === "error" ? "alert" : "status"}
          >
            {feedbackMessage}
          </div>
        )}
        <Form method="patch">
          <input
            type="hidden"
            name="campaignData"
            value={JSON.stringify({
              ...campaignData,
              is_active: campaignData?.is_active,
            })}
          />
          <input
            type="hidden"
            name="campaignDetails"
            value={JSON.stringify(campaignDetails)}
          />
          <div className="flex flex-col gap-8">
            <Section variant="flat">
              <SectionHeader
                compact
                title="Setup"
                description="Campaign type, outbound number, and schedule."
              />
              <CampaignBasicInfo
                campaignData={campaignData}
                handleInputChange={handleInputChange}
                phoneNumbers={phoneNumbers}
                flags={flags}
                callerIdOptional={
                  campaignData.type === "message" &&
                  campaignData.sms_send_mode === "messaging_service"
                }
              />
              <div className="mt-6">
                <CampaignTypeSpecificSettings
                  campaignData={campaignData}
                  handleInputChange={handleInputChange}
                  scripts={scripts}
                  details={campaignDetails!}
                  isBusy={formFetcher.state !== "idle"}
                  smsSendContext={smsSendContext}
                />
              </div>
            </Section>

            <Section variant="flat">
              <SectionHeader compact title="Queue" />
              <CampaignSettingsQueue
                queueCount={queueCount}
                dequeuedCount={dequeuedCount}
                totalCount={totalCount}
              />
            </Section>

            <Section variant="flat">
              <div id="campaign-launch" className="scroll-mt-4 space-y-4">
                <SectionHeader
                  compact
                  title="Launch"
                  description="Start, pause, schedule, or archive this campaign."
                />
                <div
                  className="flex flex-wrap gap-2"
                  data-testid="campaign-readiness"
                >
                  <Button
                    type="button"
                    variant={
                      buttonStates.play === "Active" ? "default" : "outline"
                    }
                    disabled={
                      buttonStates.play === "Disabled" ||
                      Boolean(startDisabledReason) ||
                      isBusy
                    }
                    onClick={() => handleConfirmStatus("play")}
                  >
                    {campaignData.type === "message" ? "Send now" : startLabel}
                  </Button>
                  <Button
                    type="button"
                    variant={
                      buttonStates.pause === "Active" ? "default" : "outline"
                    }
                    disabled={buttonStates.pause === "Disabled" || isBusy}
                    onClick={() => handleStatusButton("pause")}
                  >
                    Pause
                  </Button>
                  <Button
                    type="button"
                    variant={
                      buttonStates.schedule === "Active" ? "default" : "outline"
                    }
                    disabled={
                      Boolean(scheduleDisabled) ||
                      buttonStates.schedule === "Disabled" ||
                      isBusy
                    }
                    onClick={() => handleScheduleButton()}
                  >
                    {campaignData.status === "scheduled"
                      ? "Scheduled"
                      : "Schedule"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={buttonStates.archive === "Disabled" || isBusy}
                    onClick={() => handleConfirmStatus("archive")}
                  >
                    Archive
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => handleDuplicateButton()}
                  >
                    Duplicate
                  </Button>
                </div>
                {startDisabledReason ? (
                  <p className="text-sm text-muted-foreground">{startDisabledReason}</p>
                ) : null}
                {readinessIssues.length > 0 ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">
                        Campaign needs attention before it can start
                      </span>
                    </div>
                    <ul className="list-disc space-y-1 pl-5">
                      {readinessIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <CampaignLaunchExtras
                  campaignData={campaignData}
                  handleInputChange={handleInputChange}
                  mediaData={mediaData}
                  details={campaignDetails!}
                  isBusy={formFetcher.state !== "idle"}
                  queueCount={queueCount}
                  phoneNumbers={phoneNumbers}
                  outboundEstimateInputs={outboundEstimateInputs}
                />
                {campaignBilling ? (
                  <details className="rounded-md border border-border/70 p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Campaign cost
                    </summary>
                    <div className="mt-3">
                      <CampaignCostPanel
                        billing={campaignBilling}
                        queuedCount={queueCount}
                        completedCount={dequeuedCount}
                      />
                    </div>
                  </details>
                ) : null}
              </div>
            </Section>
          </div>
        </Form>
      </div>
    </>
  );
};
