import { defer, json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { CampaignSettings } from "@/components/campaign/settings/CampaignSettings";
import {
  fetchCampaignAudience,
  fetchQueueCounts,
  getSignedUrls,
  getCampaignTableKey,
  parseActionRequest,
  updateCampaign,
} from "@/lib/database.server";
import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger.server";
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
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { deepEqual } from "@/lib/utils";
import { getCampaignReadiness } from "@/lib/campaign-readiness";
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
};

const DETAIL_FIELDS = new Set(["script_id", "body_text", "message_media", "voicedrop_audio"]);

function normalizeSchedule(schedule: unknown) {
  if (!schedule) return null;

  if (typeof schedule === "string") {
    try {
      return JSON.parse(schedule);
    } catch {
      return null;
    }
  }

  return schedule;
}

function normalizeCampaignData(campaignData: CampaignWithAudiences): CampaignWithAudiences {
  return {
    ...campaignData,
    schedule: normalizeSchedule(campaignData.schedule) as Schedule | null,
  } as CampaignWithAudiences;
}

function buildCampaignDetailsForType(
  campaignType: Campaign["type"],
  currentDetails: CampaignDetails,
  campaignId: number,
  workspaceId: string,
): CampaignDetails {
  const sharedFields = {
    campaign_id: campaignId,
    workspace: workspaceId,
  };

  if (campaignType === "message") {
    return {
      ...sharedFields,
      body_text: "body_text" in currentDetails ? currentDetails.body_text ?? "" : "",
      message_media: "message_media" in currentDetails ? currentDetails.message_media ?? [] : [],
    } as CampaignDetails;
  }

  if (campaignType === "robocall" || campaignType === "simple_ivr" || campaignType === "complex_ivr") {
    return {
      ...sharedFields,
      script_id: "script_id" in currentDetails ? currentDetails.script_id ?? null : null,
    } as CampaignDetails;
  }

  return {
    ...sharedFields,
    disposition_options: "disposition_options" in currentDetails ? currentDetails.disposition_options : [],
    questions: "questions" in currentDetails ? currentDetails.questions : [],
    script_id: "script_id" in currentDetails ? currentDetails.script_id ?? null : null,
    voicedrop_audio: "voicedrop_audio" in currentDetails ? currentDetails.voicedrop_audio ?? null : null,
  } as CampaignDetails;
}

async function updateCampaignStatus(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspaceId: string,
  status: string,
  is_active?: boolean
) {
  const update: { status: string; is_active?: boolean } = { status };

  // Use is_active from client if provided, otherwise determine based on status
  if (is_active !== undefined) {
    update.is_active = is_active;
  } else {
    if (status === "running") update.is_active = true;
    if (status === "paused") update.is_active = false;
  }

  logger.debug("Server update object:", update);
  const { error } = await supabaseClient
    .from("campaign")
    .update({ ...update })
    .eq("id", Number(selected_id))
    .eq("workspace", workspaceId);

  if (error) throw error;
  return { success: true };
}

async function handleCampaignDuplicate(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspace_id: string,
  campaignData: string
) {
  const parsedData = JSON.parse(campaignData);

  // Create new campaign
  const { data: campaign, error } = await supabaseClient
    .from("campaign")
    .insert({ ...parsedData, workspace: workspace_id })
    .select('id')
    .single();

  if (error || !campaign) throw error || new Error("Failed to create campaign");

  // Clone queue if it exists
  const { data: originalQueue } = await supabaseClient
    .from("campaign_queue")
    .select('contact_id')
    .eq('campaign_id', selected_id);

  if (originalQueue?.length) {
    const newQueueItems = originalQueue.map(item => ({
      campaign_id: campaign.id,
      contact_id: item.contact_id,
      workspace: workspace_id
    }));

    const { error: queueError } = await supabaseClient
      .from("campaign_queue")
      .insert(newQueueItems);

    if (queueError) throw queueError;
  }

  // Clone campaign details
  await supabaseClient
    .from(parsedData.type === 'live_call' ? 'live_campaign' :
      parsedData.type === 'message' ? 'message_campaign' : 'ivr_campaign')
    .insert({
      campaign_id: campaign.id,
      workspace: workspace_id,
      script_id: parsedData.script_id,
      body_text: parsedData.body_text,
      message_media: parsedData.message_media,
      voicedrop_audio: parsedData.voicedrop_audio
    });

  return { success: true };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
  if (!selected_id || !workspace_id) return redirect("/");

  const data = await parseActionRequest(request);
  const intent = String(data.intent ?? "");

  switch (intent) {
    case "save": {
      try {
        const campaignDataStr = data.campaignData != null ? String(data.campaignData) : "";
        const campaignDetailsStr = data.campaignDetails != null ? String(data.campaignDetails) : "";

        if (!campaignDataStr || !campaignDetailsStr) {
          return json(
            { error: "Campaign changes could not be saved", actionType: "save" as const },
            { status: 400 },
          );
        }

        const nextCampaignData = JSON.parse(campaignDataStr);
        const nextCampaignDetails = JSON.parse(campaignDetailsStr);
        const previousCampaign = await supabaseClient
          .from("campaign")
          .select("type")
          .eq("id", Number(selected_id))
          .single();

        const result = await updateCampaign({
          supabase: supabaseClient,
          campaignData: {
            ...nextCampaignData,
            campaign_id: Number(selected_id),
            workspace: workspace_id,
            schedule: normalizeSchedule(nextCampaignData.schedule),
          },
          campaignDetails: {
            ...nextCampaignDetails,
            campaign_id: Number(selected_id),
            workspace: workspace_id,
          },
        });

        if (
          previousCampaign.data?.type &&
          previousCampaign.data.type !== nextCampaignData.type
        ) {
          const activeTable = getCampaignTableKey(nextCampaignData.type);
          const tables = ["live_campaign", "message_campaign", "ivr_campaign"] as const;

          await Promise.all(
            tables
              .filter((table) => table !== activeTable)
              .map((table) =>
                supabaseClient.from(table).delete().eq("campaign_id", Number(selected_id)),
              ),
          );
        }

        return json({
          success: true,
          actionType: "save" as const,
          campaign: result.campaign,
          campaignDetails: result.campaignDetails,
        });
      } catch (error) {
        logger.error("Error saving campaign settings", error);
        return json(
          {
            error: error instanceof Error ? error.message : "Campaign changes could not be saved",
            actionType: "save" as const,
          },
          { status: 400 },
        );
      }
    }

    case "status": {
      try {
        const status = String(data.status ?? "") as CampaignStatus;
        const is_active = String(data.is_active ?? "");
        const { data: campaignRecord, error: campaignError } = await supabaseClient
          .from("campaign")
          .select("*")
          .eq("id", Number(selected_id))
          .eq("workspace", workspace_id)
          .single();

        if (campaignError || !campaignRecord) {
          throw campaignError ?? new Error("Campaign could not be loaded");
        }

        if (status === "running" || status === "scheduled") {
          if (
            !campaignRecord.type ||
            !["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(
              campaignRecord.type,
            )
          ) {
            return json(
              {
                success: false,
                error: "Campaign type must be selected before updating status",
                actionType: "status" as const,
              },
              { status: 400 },
            );
          }

          const detailTable = getCampaignTableKey(
            campaignRecord.type as Exclude<Campaign["type"], "email" | null>,
          );
          const { data: campaignDetails, error: detailError } = await supabaseClient
            .from(detailTable)
            .select("*")
            .eq("campaign_id", Number(selected_id))
            .eq("workspace", workspace_id)
            .maybeSingle();

          if (detailError) {
            throw detailError;
          }

          const queueCounts = await fetchQueueCounts(supabaseClient as any, selected_id);
          const readiness = getCampaignReadiness(campaignRecord as Campaign, campaignDetails as CampaignDetails, {
            queueCount: queueCounts.queuedCount ?? queueCounts.fullCount ?? 0,
          });
          const readinessError =
            status === "scheduled" ? readiness.scheduleDisabledReason : readiness.startDisabledReason;

          if (readinessError) {
            return json(
              { success: false, error: readinessError, actionType: "status" as const },
              { status: 400 },
            );
          }
        }

        await updateCampaignStatus(
          supabaseClient,
          selected_id,
          workspace_id,
          status,
          is_active === "true" ? true : is_active === "false" ? false : undefined
        );
        return json({ success: true, actionType: "status" as const });
      } catch (error) {
        logger.error("Error updating campaign status", error);
        return json(
          {
            success: false,
            error: error instanceof Error ? error.message : "Campaign status could not be updated",
            actionType: "status" as const,
          },
          { status: 400 },
        );
      }
    }

    case "duplicate": {
      try {
        const campaignData = data.campaignData != null ? String(data.campaignData) : "";
        await handleCampaignDuplicate(supabaseClient, selected_id, workspace_id, campaignData);
        return json({ success: true, actionType: "duplicate" as const });
      } catch (error) {
        logger.error("Error duplicating campaign", error);
        return json(
          {
            success: false,
            error: error instanceof Error ? error.message : "Campaign could not be duplicated",
            actionType: "duplicate" as const,
          },
          { status: 400 },
        );
      }
    }

    default:
      return json({ success: false, error: "Invalid intent" }, { status: 400 });
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
  if (!selected_id || !workspace_id) return redirect("/");

  const campaignWithAudience = await fetchCampaignAudience(supabaseClient, selected_id, workspace_id);
  const { data: campaignType } = await supabaseClient
    .from("campaign")
    .select("type")
    .eq("id", Number(selected_id))
    .eq("workspace", workspace_id)
    .single();
  const { data: surveys } = await supabaseClient.from('survey').select('survey_id, title').eq('workspace', workspace_id).eq('is_active', true);
  const { data: mediaData } = await supabaseClient.storage.from("workspaceAudio").list(`${workspace_id}`);
  let mediaLinks: string[] = [];

  if (campaignType?.type === "message") {
    const { data: messageCampaign } = await supabaseClient
      .from("message_campaign")
      .select("message_media")
      .eq("campaign_id", Number(selected_id))
      .eq("workspace", workspace_id)
      .maybeSingle();

    if (Array.isArray(messageCampaign?.message_media) && messageCampaign.message_media.length > 0) {
      mediaLinks = await getSignedUrls(supabaseClient, workspace_id, messageCampaign.message_media);
    }
  }

  return defer({
    workspace_id,
    selected_id,
    campaignQueue: campaignWithAudience.campaign_queue as QueueItem[],
    queueCount: campaignWithAudience.queue_count,
    dequeuedCount: campaignWithAudience.dequeued_count,
    totalCount: campaignWithAudience.total_count,
    scripts: campaignWithAudience.scripts.filter((s): s is NonNullable<typeof s> => s !== null),
    mediaData: mediaData?.filter((media) => !media.name.startsWith("voicemail-")),
    user: user,
    mediaLinks,
    surveys,
  });
};

export default function CampaignSettingsRoute() {
  const {
    audiences,
    campaignData,
    campaignDetails,
    phoneNumbers,
    workspace,
  } = useOutletContext<Context>();

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
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const [confirmStatus, setConfirmStatus] = useState<"play" | "archive" | "none">("none");
  const initialCampaignData = useMemo(
    () => normalizeCampaignData(campaignData),
    [campaignData],
  );
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
    () => getCampaignReadiness(draftCampaignData, draftCampaignDetails, { queueCount: queueCount ?? 0 }),
    [draftCampaignData, draftCampaignDetails, queueCount],
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
        credits={(workspace as any)?.credits || 0}
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
      />
    </>
  );
}
