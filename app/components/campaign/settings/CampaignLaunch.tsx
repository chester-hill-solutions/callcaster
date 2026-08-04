import { FetcherWithComponents, Form, Link } from "react-router";
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
  Campaign,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Script,
  WorkspaceNumbers,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
  FileObject,
} from "@/lib/types";
import { CampaignLaunchExtras } from "./detailed/CampaignLaunchExtras";
import { CampaignLaunchActions } from "./CampaignLaunchActions";
import { SaveBar } from "@/components/shared/SaveBar";
import { Section, SectionHeader } from "@/components/shared/Section";
import { CampaignCostPanel } from "./CampaignCostPanel";
import { CampaignPlaceNav } from "@/components/campaign/CampaignPlaceNav";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";
import {
  formatCredits,
  formatCurrency,
  CREDIT_PRICE_CAD,
} from "@/lib/billing-format";
import { productGoalForCampaignType } from "@/lib/campaign-goals";
import type { CampaignType } from "@/lib/db-types";
import { AlertCircle } from "lucide-react";

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

export type CampaignLaunchProps = {
  campaignData: Campaign;
  campaignDetails: LiveCampaign | MessageCampaign | IVRCampaign;
  workspace: string;
  scripts: Script[];
  mediaData: FileObject[];
  isChanged: boolean;
  phoneNumbers: WorkspaceNumbers[];
  handleInputChange: (name: string, value: unknown) => void;
  handleDuplicateButton: () => void;
  handleStatusButton: (type: "play" | "pause" | "archive" | "schedule") => void;
  handleScheduleButton: () => void;
  handleSave?: () => void;
  handleResetData?: () => void;
  formFetcher: FetcherWithComponents<unknown>;
  startDisabledReason: string | null;
  readinessIssues: string[];
  queueCount: number;
  dequeuedCount: number;
  scheduleDisabled: string | boolean;
  handleConfirmStatus: (status: "play" | "archive" | "none") => void;
  confirmStatus: "play" | "archive" | "none";
  isBusy: boolean;
  isSaving: boolean;
  activeIntent: string | null;
  feedbackMessage?: string | null;
  feedbackTone?: "success" | "error" | null;
  credits: number;
  outboundEstimateInputs: {
    portalConfig: WorkspaceTwilioOpsConfig;
    syncSnapshot: WorkspaceTwilioSyncSnapshot;
  };
  campaignBilling?: CampaignBillingSummary | null;
  launchActionLabelOverride?: string;
};

export const CampaignLaunch = ({
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
  queueCount,
  dequeuedCount,
  scheduleDisabled,
  handleConfirmStatus,
  confirmStatus,
  isBusy,
  isSaving,
  activeIntent,
  feedbackMessage,
  feedbackTone,
  outboundEstimateInputs,
  campaignBilling = null,
  launchActionLabelOverride,
  workspace,
}: CampaignLaunchProps) => {
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
          <dd className="mt-1 text-sm">
            {credits > 0 ? (
              `${formatCredits(credits)} available`
            ) : (
              <Link
                to={`/workspaces/${workspace}/billing`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Add credits to launch
              </Link>
            )}
          </dd>
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
        id="campaignLaunchContainer"
        className="flex h-full min-w-0 flex-col gap-8"
        role="region"
        aria-label="Campaign launch"
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
          <Section variant="flat">
            <div className="space-y-4">
              <SectionHeader
                compact
                title="Launch"
                actions={
                  campaignData.status ? (
                    <StatusBadge status={campaignData.status} />
                  ) : null
                }
              />
              <CampaignLaunchActions
                status={campaignData.status ?? "draft"}
                startLabel={startLabel}
                isMessageCampaign={campaignData.type === "message"}
                startDisabledReason={startDisabledReason}
                scheduleDisabled={scheduleDisabled}
                isBusy={isBusy}
                onPlay={() => handleConfirmStatus("play")}
                onPause={() => handleStatusButton("pause")}
                onSchedule={() => handleScheduleButton()}
                onArchive={() => handleConfirmStatus("archive")}
                onDuplicate={() => handleDuplicateButton()}
              />
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
                workspaceId={workspace}
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
        </Form>
        <CampaignPlaceNav current="launch" />
      </div>
    </>
  );
};
