import { defer, json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "@remix-run/react";
import { verifyAuth } from "@/lib/supabase.server";
import { CampaignSettings } from "@/components/campaign/settings/CampaignSettings";
import { fetchCampaignAudience } from "@/lib/database.server";
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
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { getCampaignTableKey } from "@/lib/database.server";

type CampaignStatus = "pending" | "scheduled" | "running" | "complete" | "paused" | "draft" | "archived";

type CampaignWithAudiences = Campaign & {
  audiences?: Audience[];
  schedule?: Schedule;
};

type CampaignDetails = (LiveCampaign | MessageCampaign | IVRCampaign) & {
  script?: Script;
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
};

type CampaignUpdateFields = {
  script_id?: number;
  body_text?: string;
  message_media?: string | null;
  [key: string]: unknown;
};

async function handleCampaignUpdate(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspace_id: string,
  updates: CampaignUpdateFields
) {
  if (updates["script_id"] || updates["body_text"] || updates["message_media"]) {
    const { data: campaign, error: getCampaignError } = await supabaseClient
      .from("campaign")
      .select("type")
      .eq("id", Number(selected_id))
      .single();

    if (!campaign || getCampaignError) {
      throw new Error(getCampaignError?.message || "No campaign found");
    }

    const table = campaign.type === "message"
      ? "message_campaign"
      : campaign.type === "robocall"
        ? "ivr_campaign"
        : "live_campaign";

    const { data, error } = await supabaseClient
      .from(table)
      .update({ workspace: workspace_id, ...updates })
      .eq("campaign_id", Number(selected_id))
      .select()
      .single();

    if (error) throw error;
  } else {
    if (updates["schedule"]) {
      const parseUpdate = JSON.parse(updates["schedule"])
      updates["schedule"] = parseUpdate
    }
    const { error } = await supabaseClient
      .from("campaign")
      .update(updates)
      .eq("id", Number(selected_id));

    if (error) throw error;
  }
  return { success: true };
}

async function updateCampaignStatus(
  supabaseClient: SupabaseClient,
  selected_id: string,
  status: string,
  is_active?: boolean
) {
  let update: { status: string; is_active?: boolean } = { status };

  // Use is_active from client if provided, otherwise determine based on status
  if (is_active !== undefined) {
    update.is_active = is_active;
  } else {
    if (status === "running") update.is_active = true;
    if (status === "paused") update.is_active = false;
  }

  console.log("Server update object:", JSON.stringify(update));
  const { error } = await supabaseClient
    .from("campaign")
    .update({ ...update })
    .eq("id", Number(selected_id));

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

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "update": {
      const updates: CampaignUpdateFields = {};
      const campaignDataStr = formData.get("campaignData") as string;
      const campaignDetailsStr = formData.get("campaignDetails") as string;
      const campaignData = JSON.parse(campaignDataStr || "{}");

      // Handle script_id update
      if (formData.has("script_id")) {
        const script_id = Number(formData.get("script_id"));
        if (campaignDataStr) {
          await supabaseClient
            .from("campaign")
            .update({ ...campaignData })
            .eq("id", Number(selected_id));
        }
        if (campaignDetailsStr) {
          const tableKey = getCampaignTableKey(campaignData.type);
          await supabaseClient
            .from(tableKey as "live_campaign" | "ivr_campaign" | "message_campaign")
            .update({ script_id })
            .eq("campaign_id", Number(selected_id));
        }
        return { success: true };
      }

      // Handle body_text update
      if (formData.has("body_text")) {
        const body_text = formData.get("body_text") as string;
        const tableKey = getCampaignTableKey(campaignData.type);
        await supabaseClient
          .from(tableKey as "live_campaign" | "ivr_campaign" | "message_campaign")
          .update({ body_text })
          .eq("campaign_id", Number(selected_id));
        return { success: true };
      }

      for (const [key, value] of formData.entries()) {
        if (key !== "intent") {
          if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
            updates[key] = JSON.parse(value);
          } else {
            updates[key] = value;
          }
        }
      }

      await supabaseClient
        .from("campaign")
        .update(updates)
        .eq("id", Number(selected_id));
      return { success: true };
    }

    case "status": {
      const status = formData.get("status") as CampaignStatus;
      const is_active = formData.get("is_active") as string;
      return updateCampaignStatus(
        supabaseClient,
        selected_id,
        status,
        is_active === "true" ? true : is_active === "false" ? false : undefined
      );
    }

    case "duplicate": {
      const campaignData = formData.get("campaignData") as string;
      return handleCampaignDuplicate(supabaseClient, selected_id, workspace_id, campaignData);
    }

    default:
      return { error: "Invalid intent" };
  }
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
  if (!selected_id || !workspace_id) return redirect("/");

  const campaignWithAudience = await fetchCampaignAudience(supabaseClient, selected_id, workspace_id);
  const { data: surveys } = await supabaseClient.from('survey').select('survey_id, title').eq('workspace', workspace_id).eq('is_active', true);
  const { data: mediaData } = await supabaseClient.storage.from("workspaceAudio").list(`${workspace_id}`);
  const mediaLinksPromise = Promise.resolve(mediaData?.map((media) => media.name))
    .then((mediaNames) => mediaNames?.filter((media) => !media.startsWith("voicemail-")));

  return defer({
    workspace_id,
    selected_id,
    campaignQueue: campaignWithAudience.campaign_queue as QueueItem[],
    queueCount: campaignWithAudience.queue_count,
    totalCount: campaignWithAudience.total_count,
    scripts: campaignWithAudience.scripts.filter((s): s is NonNullable<typeof s> => s !== null),
    mediaData: mediaData?.filter((media) => !media.name.startsWith("voicemail-")),
    user: user,
    mediaLinks: mediaLinksPromise,
    surveys,
  });
};

export default function CampaignSettingsRoute() {
  const {
    supabase,
    joinDisabled,
    audiences,
    campaignData,
    campaignDetails,
    phoneNumbers,
    workspace,
    scheduleDisabled,
  } = useOutletContext<Context>();

  const {
    workspace_id,
    selected_id,
    campaignQueue,
    queueCount,
    totalCount,
    scripts,
    mediaData,
    user,
    mediaLinks,
    surveys,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();
  const [confirmStatus, setConfirmStatus] = useState<"play" | "archive" | "none" | "queue">("none");

  const handleDuplicate = () => {
    const { id, ...dataToDuplicate } = campaignData;
    fetcher.submit(
      {
        intent: "duplicate",
        campaignData: JSON.stringify(dataToDuplicate)
      },
      { method: "post" }
    );
  };

  const handleStatusChange = (status: CampaignStatus) => {
    setConfirmStatus("none");
    let formData: { intent: string; status: CampaignStatus; is_active?: boolean } = { intent: "status", status };

    if (status === "running") formData.is_active = true;
    if (status === "paused") formData.is_active = false;

    fetcher.submit(
      formData,
      { method: "post" }
    );
  };

  const handleConfirmStatus = (status: "play" | "archive" | "none" | "queue") => {
    if (status !== "none") {
      if (confirmStatus === "play") {
        handleStatusChange("running");
        return;
      } else if (confirmStatus === "archive") {
        handleStatusChange("archived");
        return;
      }
    }
    setConfirmStatus(status);
  };

<<<<<<< HEAD
  const handleInputChange = (name: string, value: string | number | null | undefined) => {
=======
  const handleInputChange = (name: string, value: string | number | boolean | Schedule | null) => {
>>>>>>> 43dba5c (Add new components and update TypeScript files for improved functionality)
    if (name === "script_id") {
      // For script selection, we need to update both campaign data and details
      fetcher.submit(
        { 
          intent: "update", 
          script_id: value?.toString() || "",
          campaignData: JSON.stringify({ ...campaignData, script_id: value }),
          campaignDetails: JSON.stringify({ ...campaignDetails, script_id: value })
        },
        { method: "post" }
      );
    } else if (name === "body_text") {
      // For message updates, we need to update the campaign details
      fetcher.submit(
        {
          intent: "update",
          body_text: value?.toString() || "",
          campaignData: JSON.stringify({ ...campaignData}),
          campaignDetails: JSON.stringify({ ...campaignDetails, body_text: value })
        },
        { method: "post" }
      );
    } else {
      fetcher.submit(
        { intent: "update", [name]: value?.toString() || "" },
        { method: "post" }
      );
    }
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
      {(user.id === "a656121d-17af-414c-97c7-71f2008f8f14" || user.id === "60c86cc8-b9fc-4995-b81e-f49e88ec208c") &&
        <Button onClick={() => resetCampaign()}>
          Reset Campaign
        </Button>}
      <CampaignSettings
        workspace={workspace_id}
        campaignData={campaignData}
        campaignDetails={campaignDetails as any}
        credits={(workspace as any)?.credits || 0}
        isActive={campaignData?.status === "running" || false}
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
        joinDisabled={joinDisabled}
        campaignQueue={campaignQueue}
        queueCount={queueCount || 0}
        totalCount={totalCount || 0}
        mediaLinks={mediaLinks instanceof Promise ? [] : mediaLinks}
        handleNavigate={(e) => {
          e.preventDefault();
          navigate(e.currentTarget.value);
        }}
        scheduleDisabled={scheduleDisabled}
        confirmStatus={confirmStatus}
        flags={{}}
        isChanged={false}
        surveys={surveys || []}
      />
    </>
  );
}
