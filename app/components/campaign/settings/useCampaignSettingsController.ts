import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useOutletContext } from "react-router";
import { useCampaignShellDirty } from "@/components/campaign/home/CampaignShellDirty";
import { useFetcherOnIdle } from "@/hooks/utils";
import { normalizeSchedule } from "@/lib/workspace-members";
import {
  buildCampaignDetailsForType,
  DETAIL_FIELDS,
  normalizeCampaignData,
} from "@/lib/campaign-settings";
import { deepEqual } from "@/lib/utils";
import { productGoalForCampaignType } from "@/lib/campaign-goals";
import type { CampaignType } from "@/lib/db-types";
import type { CampaignBillingSummary } from "@/lib/campaign-billing.server";
import type {
  Audience,
  Campaign,
  Script,
  WorkspaceNumbers,
  Schedule,
  WorkspaceData,
  LiveCampaign,
  MessageCampaign,
  IVRCampaign,
  Survey,
  FileObject,
  WorkspaceTwilioOpsConfig,
  WorkspaceTwilioSyncSnapshot,
  User,
} from "@/lib/types";

type CampaignStatus =
  | "pending"
  | "scheduled"
  | "running"
  | "waiting"
  | "complete"
  | "paused"
  | "draft"
  | "archived";

type CampaignWithAudiences = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

type CampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
  mediaLinks?: string[];
};

type Context = {
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

type SettingsLoaderData = {
  workspace_id: string;
  selected_id: string;
  campaignQueue: unknown;
  queueCount: number;
  dequeuedCount: number;
  totalCount: number;
  scripts: Script[];
  mediaData: FileObject[];
  user: User;
  mediaLinks: string[];
  surveys: Pick<Survey, "survey_id" | "title">[];
  outboundEstimateInputs: {
    portalConfig: WorkspaceTwilioOpsConfig;
    syncSnapshot: WorkspaceTwilioSyncSnapshot;
  };
  smsSendContext: {
    messagingServiceReady: boolean;
    defaultMessagingServiceSid: string | null;
    attachedSenderPhoneNumbers: string[];
  };
  campaignBilling: CampaignBillingSummary | null;
  readiness: {
    startDisabledReason: string | null;
    scheduleDisabledReason: string | null;
    startIssues: string[];
  };
};

/**
 * Shared draft/save/status controller for Setup (`/settings`) and Launch (`/launch`).
 */
export function useCampaignSettingsController() {
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
    campaignBilling,
    readiness,
  } = useLoaderData() as SettingsLoaderData;

  const fetcher = useFetcher<ActionData>();
  const { setIsDirty } = useCampaignShellDirty();
  const [confirmStatus, setConfirmStatus] = useState<"play" | "archive" | "none">(
    "none",
  );
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
  const [pendingCampaignType, setPendingCampaignType] = useState<
    Campaign["type"] | null
  >(null);
  const isChanged =
    !deepEqual(draftCampaignData, savedCampaignData) ||
    !deepEqual(draftCampaignDetails, savedCampaignDetails);

  /**
   * @effect Mirror local draft dirty state into CampaignShellDirty for rail navigation guards.
   * @effect-deps isChanged (draft vs saved), setIsDirty from shell context
   * @effect-side-effects context setter; clears dirty on unmount
   * @effect-why-not-loader Dirty state is client edit chrome shared across sibling routes.
   */
  useEffect(() => {
    setIsDirty(isChanged);
    return () => setIsDirty(false);
  }, [isChanged, setIsDirty]);

  const [prevInitialCampaignData, setPrevInitialCampaignData] =
    useState(initialCampaignData);
  const [prevCampaignDetails, setPrevCampaignDetails] = useState(campaignDetails);
  if (
    prevInitialCampaignData !== initialCampaignData ||
    prevCampaignDetails !== campaignDetails
  ) {
    const previousStatus = prevInitialCampaignData.status;
    setPrevInitialCampaignData(initialCampaignData);
    setPrevCampaignDetails(campaignDetails);
    if (!isChanged) {
      setSavedCampaignData(initialCampaignData);
      setSavedCampaignDetails(campaignDetails);
      setDraftCampaignData(initialCampaignData);
      setDraftCampaignDetails(campaignDetails);
    } else if (initialCampaignData.status !== previousStatus) {
      const nextStatus = initialCampaignData.status as CampaignStatus;
      setDraftCampaignData((current) => ({ ...current, status: nextStatus }));
      setSavedCampaignData((current) => ({ ...current, status: nextStatus }));
    }
  }

  useFetcherOnIdle(fetcher, (data) => {
    if (!data?.success) {
      return;
    }

    if (data.actionType === "save" && data.campaign && data.campaignDetails) {
      const nextCampaignData = normalizeCampaignData(
        data.campaign as CampaignWithAudiences,
      );

      setSavedCampaignData(nextCampaignData);
      setSavedCampaignDetails(data.campaignDetails);
      setDraftCampaignData(nextCampaignData);
      setDraftCampaignDetails(data.campaignDetails);
      return;
    }

    if (data.actionType === "status") {
      setConfirmStatus("none");
      const newStatus = data.status;
      if (newStatus) {
        setDraftCampaignData((current) => ({
          ...current,
          status: newStatus as CampaignStatus,
        }));
        setSavedCampaignData((current) => ({
          ...current,
          status: newStatus as CampaignStatus,
        }));
      }
    }
  });

  const activeIntent = fetcher.formData
    ? String(fetcher.formData.get("intent") ?? "")
    : null;
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
  const feedbackTone: "success" | "error" | null = fetcher.data?.error
    ? "error"
    : feedbackMessage
      ? "success"
      : null;

  const readinessFromLoader = readiness;
  const startDisabledReason = isChanged
    ? "Save your changes before starting this campaign"
    : readinessFromLoader.startDisabledReason;
  const scheduleDisabledReason = isChanged
    ? "Save your changes before scheduling this campaign"
    : readinessFromLoader.scheduleDisabledReason;
  const readinessIssues = isChanged
    ? ["Save your changes to refresh campaign readiness."]
    : readinessFromLoader.startIssues;

  const launchLabel = (() => {
    const goal = draftCampaignData.type
      ? productGoalForCampaignType(draftCampaignData.type as CampaignType)
      : null;
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
  })();

  const handleDuplicate = () => {
    const { id, ...dataToDuplicate } = draftCampaignData;
    fetcher.submit(
      {
        intent: "duplicate",
        campaignData: JSON.stringify(dataToDuplicate),
      },
      { method: "post" },
    );
  };

  const handleStatusChange = (status: CampaignStatus) => {
    fetcher.submit({ intent: "status", status }, { method: "post" });
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
        : name === "schedule" || name === "sms_send_window"
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
      message_media:
        "message_media" in nextDetails ? nextDetails.message_media ?? [] : null,
      voicedrop_audio:
        "voicedrop_audio" in nextDetails
          ? nextDetails.voicedrop_audio ?? null
          : null,
    }));
    setPendingCampaignType(null);
  };

  const handleStatusButton = (type: "play" | "pause" | "archive" | "schedule") => {
    if (type === "play" || type === "archive") {
      setConfirmStatus(type);
    } else if (type === "pause") {
      setDraftCampaignData((current) => ({ ...current, status: "paused" }));
      setSavedCampaignData((current) => ({ ...current, status: "paused" }));
      handleStatusChange("paused");
    } else if (type === "schedule") {
      setDraftCampaignData((current) => ({ ...current, status: "scheduled" }));
      setSavedCampaignData((current) => ({ ...current, status: "scheduled" }));
      handleStatusChange("scheduled");
    }
  };

  const handleScheduleButton = () => {
    setDraftCampaignData((current) => ({ ...current, status: "scheduled" }));
    setSavedCampaignData((current) => ({ ...current, status: "scheduled" }));
    handleStatusChange("scheduled");
  };

  const resetCampaign = () => {
    const formData = new FormData();
    formData.append("campaign_id", selected_id);
    fetcher.submit(formData, {
      method: "POST",
      action: "/api/reset_campaign",
    });
  };

  return {
    audiences,
    phoneNumbers,
    workspace_id,
    selected_id,
    queueCount: queueCount || 0,
    dequeuedCount: dequeuedCount || 0,
    totalCount: totalCount || 0,
    scripts,
    mediaData: mediaData || [],
    user,
    mediaLinks,
    surveys: surveys || [],
    outboundEstimateInputs,
    smsSendContext,
    campaignBilling: campaignBilling as CampaignBillingSummary | null,
    credits: Number((workspaceRecord as { credits?: number })?.credits ?? 0),
    draftCampaignData,
    draftCampaignDetails,
    pendingCampaignType,
    setPendingCampaignType,
    isChanged,
    confirmStatus,
    fetcher,
    isBusy,
    isSaving,
    activeIntent,
    feedbackMessage,
    feedbackTone,
    startDisabledReason,
    scheduleDisabledReason,
    readinessIssues,
    launchLabel,
    handleDuplicate,
    handleConfirmStatus,
    handleInputChange,
    handleSave,
    handleResetData,
    handleConfirmTypeChange,
    handleStatusButton,
    handleScheduleButton,
    resetCampaign,
  };
}
