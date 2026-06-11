export { loader } from "./settings.loader.server";
export { action } from "./settings.action.server";

import { data as routeData, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "react-router";

import { CampaignSettings } from "@/components/campaign/settings/CampaignSettings";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";


import { workspaceMessagingServiceHasAvailableSenders } from "@/lib/sms-campaign-send-mode";
import { SupabaseClient } from "@supabase/supabase-js";

import {
  Audience,
  Campaign,
  Script,
  WorkspaceNumbers,
  Schedule,
  WorkspaceData,
  QueueItem,
  LiveCampaign,
  MessageCampaign,
  IVRCampaign,
  Survey,
  TwilioAccountData,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { normalizeSchedule } from "@/lib/workspace-members";
import {
  buildCampaignDetailsForType,
  DETAIL_FIELDS,
  normalizeCampaignData,
} from "@/lib/campaign-settings";
import { deepEqual } from "@/lib/utils";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
import {
  getCampaignSetupDismissKey,
  getCampaignSetupSteps,
  shouldShowCampaignSetupGuide,
} from "@/lib/campaign-setup-steps";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CampaignStatus = "pending" | "scheduled" | "running" | "complete" | "paused" | "draft" | "archived";

type CampaignWithAudiences = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

type CampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

type Context = {
  supabase: SupabaseClient;
  joinDisabled: string | null;
  audiences: Audience[];
  campaignData: CampaignWithAudiences;
  campaignDetails: CampaignDetails;
  scheduleDisabled: string | boolean;
  phoneNumbers: WorkspaceNumbers[];
  workspace: WorkspaceData; 
};

type ActionData = {
  success?: boolean;
  error?: string;
  campaign?: CampaignWithAudiences;
  campaignDetails?: CampaignDetails;
  actionType?: "save" | "status" | "duplicate";
  status?: string;
};

export default function CampaignSettingsRoute() {
  const {
    audiences,
    campaignData,
    campaignDetails,
    phoneNumbers,
    workspace,
  } = useOutletContext<Context>();
  const workspaceRecord = Array.isArray(workspace) ? workspace[0] : workspace;

  const {
    workspace_id,
    selected_id,
    campaignQueue,
    queueCount,
    dequeuedCount,
    totalCount,
    scripts,
    mediaData,
    user,
    mediaLinks,
    surveys,
    outboundEstimateInputs,
    smsSendContext,
    isFirstDraftCampaign,
    campaignBilling,
  } = useLoaderData();

  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const [confirmStatus, setConfirmStatus] = useState<"play" | "archive" | "none">("none");
  const [setupGuideDismissed, setSetupGuideDismissed] = useState(() => {
    if (typeof window === "undefined" || !selected_id) {
      return false;
    }
    return (
      window.sessionStorage.getItem(getCampaignSetupDismissKey(selected_id)) ===
      "1"
    );
  });
  const initialCampaignData = useMemo(() => {
    const normalized = normalizeCampaignData(campaignData);
    if (normalized.type !== "message") {
      return normalized;
    }
    if (normalized.sms_send_mode != null) {
      return normalized;
    }
    if (
      smsSendContext?.messagingServiceReady &&
      smsSendContext.defaultMessagingServiceSid
    ) {
      return {
        ...normalized,
        sms_send_mode: "messaging_service" as const,
        sms_messaging_service_sid: smsSendContext.defaultMessagingServiceSid,
      };
    }
    return {
      ...normalized,
      sms_send_mode: "from_number" as const,
      sms_messaging_service_sid: null,
    };
  }, [campaignData, smsSendContext]);
  const [savedCampaignData, setSavedCampaignData] = useState(initialCampaignData);
  const [savedCampaignDetails, setSavedCampaignDetails] = useState(campaignDetails);
  const [draftCampaignData, setDraftCampaignData] = useState(initialCampaignData);
  const [draftCampaignDetails, setDraftCampaignDetails] = useState(campaignDetails);
  const [pendingCampaignType, setPendingCampaignType] = useState<Campaign["type"] | null>(null);
  const isChanged =
    !deepEqual(draftCampaignData, savedCampaignData) ||
    !deepEqual(draftCampaignDetails, savedCampaignDetails);

  useEffect(() => {
    if (isChanged) {
      return;
    }

    setSavedCampaignData(initialCampaignData);
    setSavedCampaignDetails(campaignDetails);
    setDraftCampaignData(initialCampaignData);
    setDraftCampaignDetails(campaignDetails);
  }, [campaignDetails, initialCampaignData, isChanged]);

  useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      fetcher.data?.actionType !== "save" ||
      !fetcher.data.success ||
      !fetcher.data.campaign ||
      !fetcher.data.campaignDetails
    ) {
      return;
    }

    const nextCampaignData = normalizeCampaignData(
      fetcher.data.campaign as CampaignWithAudiences,
    );

    setSavedCampaignData(nextCampaignData);
    setSavedCampaignDetails(fetcher.data.campaignDetails);
    setDraftCampaignData(nextCampaignData);
    setDraftCampaignDetails(fetcher.data.campaignDetails);
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success && fetcher.data.actionType === "status") {
      setConfirmStatus("none");
      const newStatus = (fetcher.data as { status?: string }).status;
      if (newStatus) {
        setDraftCampaignData((current) => ({ ...current, status: newStatus as CampaignStatus }));
        setSavedCampaignData((current) => ({ ...current, status: newStatus as CampaignStatus }));
      }
    }
  }, [fetcher.data, fetcher.state]);

  const activeIntent = fetcher.formData ? String(fetcher.formData.get("intent") ?? "") : null;
  const isBusy = fetcher.state !== "idle";
  const isSaving = isBusy && activeIntent === "save";
  const feedbackMessage = fetcher.data?.error
    ? fetcher.data.error
    : fetcher.state === "idle" && fetcher.data?.success
      ? fetcher.data.actionType === "save"
        ? "Campaign changes saved."
        : fetcher.data.actionType === "status"
          ? "Campaign status updated."
          : fetcher.data.actionType === "duplicate"
            ? "Campaign duplicated."
            : null
      : null;
  const feedbackTone = fetcher.data?.error
    ? "error"
    : feedbackMessage
      ? "success"
      : null;

  const readiness = useMemo(
    () =>
      getCampaignReadiness(draftCampaignData, draftCampaignDetails, {
        queueCount: queueCount ?? 0,
        smsSenderClass: outboundEstimateInputs.portalConfig.smsSenderClass,
        smsMessagingServiceSendersReady:
          draftCampaignData.type === "message" &&
          draftCampaignData.sms_send_mode === "messaging_service"
            ? smsSendContext?.messagingServiceReady
            : undefined,
      }),
    [
      draftCampaignData,
      draftCampaignDetails,
      queueCount,
      smsSendContext?.messagingServiceReady,
      outboundEstimateInputs.portalConfig.smsSenderClass,
    ],
  );
  const startDisabledReason = isChanged
    ? "Save your changes before starting this campaign"
    : readiness.startDisabledReason;
  const scheduleDisabledReason = isChanged
    ? "Save your changes before scheduling this campaign"
    : readiness.scheduleDisabledReason;
  const readinessIssues = isChanged
    ? ["Save your changes to refresh campaign readiness."]
    : readiness.startIssues;

  const setupGuideState = useMemo(
    () =>
      getCampaignSetupSteps({
        campaignData: draftCampaignData,
        campaignDetails: draftCampaignDetails,
        phoneNumbers,
        queueCount: queueCount ?? 0,
        audienceCount: audiences?.length ?? 0,
        scriptsCount: scripts?.length ?? 0,
        workspaceId: workspace_id,
        smsMessagingServiceSendersReady:
          draftCampaignData.type === "message" &&
          draftCampaignData.sms_send_mode === "messaging_service"
            ? smsSendContext?.messagingServiceReady
            : undefined,
      }),
    [
      audiences?.length,
      draftCampaignData,
      draftCampaignDetails,
      phoneNumbers,
      queueCount,
      scripts?.length,
      smsSendContext?.messagingServiceReady,
      workspace_id,
    ],
  );

  const showSetupGuide = shouldShowCampaignSetupGuide({
    isFirstDraftCampaign: Boolean(isFirstDraftCampaign),
    dismissed: setupGuideDismissed,
    allComplete: setupGuideState.allComplete,
  });

  const handleDismissSetupGuide = () => {
    if (typeof window !== "undefined" && selected_id) {
      window.sessionStorage.setItem(getCampaignSetupDismissKey(selected_id), "1");
    }
    setSetupGuideDismissed(true);
  };

  const handleDuplicate = () => {
    const { id, ...dataToDuplicate } = draftCampaignData;
    fetcher.submit(
      {
        intent: "duplicate",
        campaignData: JSON.stringify(dataToDuplicate)
      },
      { method: "post" }
    );
  };

  const handleStatusChange = (status: CampaignStatus) => {
    const formData: { intent: string; status: CampaignStatus; is_active?: boolean } = { intent: "status", status };

    if (status === "running") formData.is_active = true;
    if (status === "paused") formData.is_active = false;

    fetcher.submit(
      formData,
      { method: "post" }
    );
  };

  const handleConfirmStatus = (status: "play" | "archive" | "none") => {
    if (status === "none") {
      if (!isBusy) {
        setConfirmStatus("none");
      }
      return;
    }

    if (status === "play") {
      if (confirmStatus === "play") {
        handleStatusChange("running");
        return;
      }

      setConfirmStatus("play");
      return;
    }

    if (status === "archive") {
      if (confirmStatus === "archive") {
        handleStatusChange("archived");
        return;
      } 
    }

    setConfirmStatus("archive");
  };

  const handleInputChange = (name: string, value: unknown) => {
    if (name === "type") {
      const nextType = String(value) as Campaign["type"];

      if (nextType !== draftCampaignData.type) {
        setPendingCampaignType(nextType);
      }

      return;
    }

    const normalizedValue =
      name === "script_id"
        ? value === "" || value == null
          ? null
          : Number(value)
        : name === "schedule"
          ? normalizeSchedule(value)
          : value;

    if (DETAIL_FIELDS.has(name)) {
      setDraftCampaignDetails((currentDetails) => ({
        ...currentDetails,
        [name]: normalizedValue,
      }));
      setDraftCampaignData((currentCampaignData) => ({
        ...currentCampaignData,
        [name]: normalizedValue,
      }));
      return;
    }

    setDraftCampaignData((currentCampaignData) => ({
      ...currentCampaignData,
      [name]: normalizedValue,
    }));
  };

  const handleSave = () => {
    fetcher.submit(
      {
        intent: "save",
        campaignData: JSON.stringify(draftCampaignData),
        campaignDetails: JSON.stringify(draftCampaignDetails),
      },
      { method: "post" },
    );
  };

  const handleResetData = () => {
    setDraftCampaignData(savedCampaignData);
    setDraftCampaignDetails(savedCampaignDetails);
    setPendingCampaignType(null);
  };

  const handleConfirmTypeChange = () => {
    if (!pendingCampaignType) {
      return;
    }

    const nextDetails = buildCampaignDetailsForType(
      pendingCampaignType,
      draftCampaignDetails,
      Number(selected_id),
      workspace_id,
    );

    setDraftCampaignDetails(nextDetails);
    setDraftCampaignData((currentCampaignData) => ({
      ...currentCampaignData,
      type: pendingCampaignType,
      script_id: "script_id" in nextDetails ? nextDetails.script_id ?? null : null,
      body_text: "body_text" in nextDetails ? nextDetails.body_text ?? "" : null,
      message_media: "message_media" in nextDetails ? nextDetails.message_media ?? [] : null,
      voicedrop_audio: "voicedrop_audio" in nextDetails ? nextDetails.voicedrop_audio ?? null : null,
    }));
    setPendingCampaignType(null);
  };

  const resetCampaign = () => {
    const formData = new FormData();
    formData.append("campaign_id", selected_id);
    fetcher.submit(formData, {
      method: 'POST',
      action: "/api/reset_campaign"
    })
  }

  return (
    <>
      <Dialog
        open={pendingCampaignType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCampaignType(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change campaign type?</DialogTitle>
            <DialogDescription>
              Changing the campaign type updates which setup fields are required and may clear
              channel-specific content that does not apply to the new flow.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Shared settings like title, dates, phone number, and queue stay in place. Save the
            change after reviewing the updated settings.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCampaignType(null)}>
              Keep Current Type
            </Button>
            <Button onClick={handleConfirmTypeChange}>Change Type</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {(user.id === "a656121d-17af-414c-97c7-71f2008f8f14" || user.id === "60c86cc8-b9fc-4995-b81e-f49e88ec208c") &&
        <Button onClick={() => resetCampaign()}>
          Reset Campaign
        </Button>}
      <CampaignSettings
        workspace={workspace_id}
        campaignData={draftCampaignData}
        campaignDetails={draftCampaignDetails as any}
        credits={Number((workspaceRecord as { credits?: number })?.credits ?? 0)}
        isActive={draftCampaignData?.status === "running" || false}
        scripts={scripts}
        audiences={audiences}
        mediaData={mediaData || []}
        campaign_id={selected_id}
        phoneNumbers={phoneNumbers}
        handleInputChange={handleInputChange}
        handleDuplicateButton={handleDuplicate}
        handleStatusButton={(type) => {
          if (type === "play" || type === "archive") {
            setConfirmStatus(type);
          } else if (type === "pause") {
            handleStatusChange("paused");
          } else if (type === "schedule") {
            handleStatusChange("scheduled");
          }
        }}
        handleConfirmStatus={handleConfirmStatus}
        handleScheduleButton={() => handleStatusChange("scheduled")}
        formFetcher={fetcher}
        user={user}
        startDisabledReason={startDisabledReason}
        readinessIssues={readinessIssues}
        campaignQueue={campaignQueue}
        queueCount={queueCount || 0}
        dequeuedCount={dequeuedCount || 0}
        totalCount={totalCount || 0}
        mediaLinks={mediaLinks}
        isBusy={isBusy}
        isSaving={isSaving}
        activeIntent={activeIntent}
        feedbackMessage={feedbackMessage}
        feedbackTone={feedbackTone}
        handleNavigate={(e) => {
          e.preventDefault();
          navigate(e.currentTarget.value);
        }}
        scheduleDisabled={scheduleDisabledReason || false}
        confirmStatus={confirmStatus}
        flags={{}}
        isChanged={isChanged}
        handleSave={handleSave}
        handleResetData={handleResetData}
        surveys={surveys || []}
        outboundEstimateInputs={outboundEstimateInputs}
        smsSendContext={smsSendContext}
        showSetupGuide={showSetupGuide}
        setupGuideSteps={setupGuideState.steps}
        setupGuideCurrentStepNumber={setupGuideState.currentStepNumber}
        setupGuideTotalSteps={setupGuideState.totalSteps}
        setupGuideAllComplete={setupGuideState.allComplete}
        onDismissSetupGuide={handleDismissSetupGuide}
        campaignBilling={campaignBilling as CampaignBillingSummary | null}
      />
    </>
  );
}
