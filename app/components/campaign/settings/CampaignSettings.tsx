import { FetcherWithComponents, Form } from "react-router";
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
  Contact,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  QueueItem,
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
import { SaveBar } from "@/components/shared/SaveBar";
import { CampaignSettingsQueue } from "./CampaignSettingsQueue";
import { CampaignSetupGuide } from "./CampaignSetupGuide";
import type { CampaignSetupStep } from "@/lib/campaign-setup-steps";
import { CampaignCostPanel } from "./CampaignCostPanel";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";
import { formatCredits, formatCurrency , CREDIT_PRICE_CAD } from "@/lib/billing-format";


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
  campaignQueue: QueueItem[];
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
  showSetupGuide?: boolean;
  setupGuideSteps?: CampaignSetupStep[];
  setupGuideCurrentStepNumber?: number;
  setupGuideTotalSteps?: number;
  setupGuideAllComplete?: boolean;
  setupGuideTitle?: string;
  setupGuideLaunchActionLabel?: string;
  onDismissSetupGuide?: () => void;
  campaignBilling?: CampaignBillingSummary | null;
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
  mediaLinks,
  startDisabledReason,
  readinessIssues,
  flags,
  campaignQueue,
  queueCount,
  dequeuedCount,
  totalCount,
  handleNavigate,
  scheduleDisabled,
  handleConfirmStatus,
  confirmStatus,  
  isBusy,
  isSaving,
  activeIntent,
  feedbackMessage,
  feedbackTone,
  surveys,
  outboundEstimateInputs,
  smsSendContext,
  showSetupGuide = false,
  setupGuideSteps = [],
  setupGuideCurrentStepNumber = 1,
  setupGuideTotalSteps = 1,
  setupGuideAllComplete = false,
  setupGuideTitle,
  setupGuideLaunchActionLabel,
  onDismissSetupGuide,
  campaignBilling = null,
}: CampaignSettingsProps) => {
  const confirmActionLabel =
    confirmStatus === "play"
      ? activeIntent === "status" && isBusy
        ? "Starting..."
        : setupGuideLaunchActionLabel ?? "Start campaign"
      : activeIntent === "status" && isBusy
        ? "Archiving..."
        : "Archive Campaign";

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
            {formatReviewDate(campaignData.start_date)}–{formatReviewDate(campaignData.end_date)}
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
            {confirmStatus === "play" ? "Review campaign launch" : confirmStatus === "archive" ? "Archive Campaign" : ""}
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
      </Dialog >

      <div
        id="campaignSettingsContainer"
        className="flex h-full min-w-0 flex-col gap-8 p-4 sm:p-6"
        role="region"
        aria-label="Campaign Settings"
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
        {showSetupGuide && setupGuideSteps.length > 0 ? (
          <CampaignSetupGuide
            steps={setupGuideSteps}
            currentStepNumber={setupGuideCurrentStepNumber}
            totalSteps={setupGuideTotalSteps}
            allComplete={setupGuideAllComplete}
            title={setupGuideTitle}
            launchActionLabel={setupGuideLaunchActionLabel}
            onDismiss={() => onDismissSetupGuide?.()}
            onStartCampaign={() => handleConfirmStatus("play")}
          />
        ) : null}
        <Form method="patch">
          <input
            type="hidden"
            name="campaignData"
            value={JSON.stringify({ ...campaignData, is_active: campaignData?.is_active })}
          />
          <input
            type="hidden"
            name="campaignDetails"
            value={JSON.stringify(campaignDetails)}
          />
          <div className="flex flex-col space-y-4">
            <section className="rounded-lg border p-4">
              <CampaignBasicInfo
                campaignData={campaignData}
                handleInputChange={handleInputChange}
                handleButton={handleStatusButton}
                handleConfirmStatus={handleConfirmStatus}
                handleDuplicateButton={handleDuplicateButton}
                phoneNumbers={phoneNumbers}
                flags={flags}
                startDisabledReason={startDisabledReason}
                readinessIssues={readinessIssues}
                scheduleDisabled={scheduleDisabled}
                isBusy={isBusy}
                callerIdOptional={
                  campaignData.type === "message" &&
                  campaignData.sms_send_mode === "messaging_service"
                }
                hideReadinessAlerts={showSetupGuide}
              />
            </section>
            <section className="rounded-lg border p-4">
              <CampaignTypeSpecificSettings
                campaignData={campaignData}
                handleInputChange={handleInputChange}
                mediaData={mediaData}
                scripts={scripts}
                handleActivateButton={handleStatusButton}
                handleScheduleButton={handleScheduleButton}
                details={campaignDetails!}
                mediaLinks={mediaLinks}
                isChanged={isChanged}
                isBusy={formFetcher.state !== "idle"}
                joinDisabled={startDisabledReason}
                scheduleDisabled={scheduleDisabled}
                readinessIssues={readinessIssues}
                surveys={surveys}
                handleNavigate={handleNavigate}
                queueCount={queueCount}
                phoneNumbers={phoneNumbers}
                outboundEstimateInputs={outboundEstimateInputs}
                smsSendContext={smsSendContext}
                hideReadinessAlerts={showSetupGuide}
              />
            </section>

            <CampaignSettingsQueue
              campaignQueue={campaignQueue}
              queueCount={queueCount}
              dequeuedCount={dequeuedCount}
              totalCount={totalCount}
              setupGuideActive={showSetupGuide}
            />

            {campaignBilling ? (
              <CampaignCostPanel
                billing={campaignBilling}
                queuedCount={queueCount}
                completedCount={dequeuedCount}
              />
            ) : null}
          </div>
        </Form>
      </div>
    </>
  );
};
