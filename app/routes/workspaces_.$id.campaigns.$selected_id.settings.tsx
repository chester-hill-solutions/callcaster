import { defer, json, LoaderFunctionArgs, ActionFunctionArgs, redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { fetchCampaignAudience } from "~/lib/database.server";
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
} from "~/lib/types";
import { Button } from "~/components/ui/button";

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
  credits: number;
  phoneNumbers: WorkspaceNumbers[];
  workspace: WorkspaceData;
};

type ActionData = {
  success?: boolean;
  error?: string;
  campaign?: CampaignWithAudiences;
  campaignDetails?: CampaignDetails;
};

async function handleCampaignUpdate(
  supabaseClient: SupabaseClient,
  selected_id: string,
  workspace_id: string,
  updates: Record<string, any>
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
    if (updates["schedule"]){
       const parseUpdate = JSON.parse(updates["schedule"])
       updates.schedule = parseUpdate
    }
    const { error } = await supabaseClient
      .from("campaign")
      .update(updates)
      .eq("id", Number(selected_id));

    if (error) throw error;
  }
  return { success: true };
}

async function handleStatusChange(
  supabaseClient: SupabaseClient,
  selected_id: string,
  status: string
) {
  let update = { status };
  if (status === "play") update = { status: "running", is_active: true };
  if (status === "pause") update = { status: "paused", is_active: false };
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

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
  if (!selected_id || !workspace_id) return redirect("/");

  try {
    const formData = await request.formData();
    const intent = formData.get("intent");
    const updates = Object.fromEntries(formData);
    delete updates.intent;

    switch (intent) {
      case "update":
        return json<ActionData>(
          await handleCampaignUpdate(supabaseClient, selected_id, workspace_id, updates)
        );

      case "status":
        return json<ActionData>(
          await handleStatusChange(supabaseClient, selected_id, updates.status as CampaignStatus)
        );

      case "duplicate":
        return json<ActionData>(
          await handleCampaignDuplicate(supabaseClient, selected_id, workspace_id, updates.campaignData as string)
        );

      default:
        return json<ActionData>({ error: "Invalid intent" }, { status: 400 });
    }
  } catch (error) {
    console.error('Action error:', error);
    return json<ActionData>(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 400 }
    );
  }
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  const { supabaseClient, user } = await verifyAuth(request);

  if (!user) return redirect("/signin");
  if (!selected_id || !workspace_id) return redirect("/");

  const campaignWithAudience = await fetchCampaignAudience(supabaseClient, selected_id, workspace_id);
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
  });
};

function renderConfirmDescription(
  status: "play" | "archive" | "none" | "queue",
  campaignData: CampaignWithAudiences | null,
  queueCount: number,
  credits: number
) {
  if (status === "play") {
    return (
      <div className="space-y-4">
        <p className="font-medium text-lg">
          Are you sure you want to start this campaign? {
            campaignData?.type === "live_call" ?
              "This will make your campaign active and available for callers." :
              campaignData?.type === "message" ?
                "This will begin sending messages to your contacts." :
                "This will begin dialing contacts automatically."
          }
        </p>

        <div className="rounded-lg bg-muted p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-primary">💰</span>
            <div>
              <p className="font-medium">Credits Available: {credits}</p>
              <p className="text-sm text-muted-foreground">
                Cost: {campaignData?.type === "message" ?
                  "1 credit per message" :
                  "1 credit per dial + 1 credit per minute after first minute"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-primary">📞</span>
            <div>
              <p className="font-medium">
                Contacts to {campaignData?.type === "message" ? "Message" : "Dial"}: {queueCount}
              </p>
              <p className="text-sm text-muted-foreground">
                Estimated cost: {queueCount} - {queueCount * 2} credits
                {queueCount > credits && (
                  <span className="text-destructive"> (Exceeds available credits)</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {queueCount > credits && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            ⚠️ Warning: Your campaign will be paused when you run out of credits
          </div>
        )}
      </div>
    );
  }

  if (status === "archive") {
    return "Are you sure you want to archive this campaign? It will be hidden from your campaigns list, and can't be undone.";
  }

  return "";
}

export default function CampaignSettingsRoute() {
  const {
    supabase,
    joinDisabled,
    audiences,
    campaignData,
    campaignDetails,
    credits,
    phoneNumbers,
    workspace,
    scheduleDisabled
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
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();

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

    fetcher.submit(
      { intent: "status", status },
      { method: "post" }
    );
  };

  const handleInputChange = (name: string, value: any) => {
    fetcher.submit(
      { intent: "update", [name]: value },
      { method: "post" }
    );
  };

  const resetCampaign = () => {
    const formData = new FormData();
    formData.append("campaign_id", selected_id);
    fetcher.submit(formData, {
      method:'POST',
      action: "/api/reset_campaign",
      navigate: false
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
        campaignDetails={campaignDetails}
        isActive={campaignData.status === "running"}
        scripts={scripts}
        audiences={audiences}
        mediaData={mediaData || []}
        campaign_id={selected_id}
        phoneNumbers={phoneNumbers}
        handleInputChange={handleInputChange}
        handleDuplicateButton={handleDuplicate}
        handleStatusButton={handleStatusChange}
        handleConfirmStatus={handleStatusChange}
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
      />
    </>
  );
}
