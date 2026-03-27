import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useEffect } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { deepEqual } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SaveBar } from "@/components/shared/SaveBar";
import {
  getMedia,
  getSignedUrls,
  getUserRole,
  getWorkspaceScripts,
  listMedia,
} from "@/lib/database.server";
import { MessageSettings } from "@/components/settings/MessageSettings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LoaderFunctionArgs , ActionFunctionArgs } from "@remix-run/node";
import type { Script } from "@/lib/types";
import { logger } from "@/lib/logger.server";
import { logger as loggerClient } from "@/lib/logger.client";
import { normalizeScriptPageDataForComparison } from "@/lib/script-change";
import { isObject } from "@/lib/type-utils";

type CampaignType = "live_call" | "message" | "robocall" | "simple_ivr" | "complex_ivr";

type BaseCampaignDetails = {
  campaign_id: number | null;
  created_at: string;
  id: number;
  script_id: number | null;
  workspace: string;
  script?: Script;
  mediaLinks?: Array<string | { [key: string]: string }>;
  message_media?: string[];
  disposition_options?: Record<string, unknown>;
  questions?: Record<string, unknown>;
  voicedrop_audio?: string | null;
};

type LoaderData = {
  workspace_id: string;
  selected_id: string;
  data: {
    id: number;
    type: CampaignType;
    campaignDetails: BaseCampaignDetails;
  };
  mediaNames: string[];
  userRole: string;
  scripts: Script[];
};

type PageData = LoaderData['data'];

function getScriptRecordingFileNames(script: Script | undefined): string[] {
  if (!script?.steps || !isObject(script.steps) || Array.isArray(script.steps)) {
    return [];
  }

  const rawSteps = script.steps as Record<string, unknown>;
  if (!isObject(rawSteps.blocks)) {
    return [];
  }

  return Object.values(rawSteps.blocks)
    .flatMap((block) => {
      if (!isObject(block)) {
        return [];
      }

      const speechType = block.speechType;
      const audioFile = block.audioFile;
      if (
        speechType === "recorded" &&
        typeof audioFile === "string" &&
        audioFile.length > 0
      ) {
        return [audioFile];
      }

      return [];
    });
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  
  if (!workspace_id || !selected_id) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return redirect("/signin");
  }

  const userRole = await getUserRole({ supabaseClient, user, workspaceId: workspace_id });
  const scripts = await getWorkspaceScripts({
    workspace: workspace_id,
    supabase: supabaseClient,
  }) || [];

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select(`*, campaign_audience(*)`)
    .eq("id", parseInt(selected_id))
    .single();

  if (campaignError) {
    logger.error("Error fetching campaign data", campaignError);
    throw new Response("Error fetching campaign data", { status: 500 });
  }

  if (!campaignData.type || !["live_call", "message", "robocall", "simple_ivr", "complex_ivr"].includes(campaignData.type)) {
    throw new Response("Invalid campaign type", { status: 400 });
  }

  let campaignDetails: BaseCampaignDetails | null = null;
  let mediaNames: string[] = [];

  const files = await listMedia(supabaseClient, workspace_id);
  if (files) {
    mediaNames = files.map(file => file.name);
  }

  switch (campaignData.type) {
    case "live_call":
      ({ data: campaignDetails } = await supabaseClient
        .from("live_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", parseInt(selected_id))
        .single());
      break;

    case "message":
      ({ data: campaignDetails } = await supabaseClient
        .from("message_campaign")
        .select()
        .eq("campaign_id", parseInt(selected_id))
        .single());
      if (campaignDetails && Array.isArray(campaignDetails.message_media) && campaignDetails.message_media.length > 0) {
        const mediaLinks = await getSignedUrls(
          supabaseClient,
          workspace_id,
          campaignDetails.message_media
        );
        campaignDetails = {
          ...campaignDetails,
          mediaLinks: mediaLinks as unknown as { [key: string]: string }[]
        };
      }
      break;

    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      ({ data: campaignDetails } = await supabaseClient
        .from("ivr_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", parseInt(selected_id))
        .single());
      if (campaignDetails?.script?.steps) {
        const fileNames = getScriptRecordingFileNames(campaignDetails.script);
        const mediaLinks = await getMedia(
          fileNames,
          supabaseClient,
          workspace_id
        ) || [];
        campaignDetails = {
          ...campaignDetails,
          mediaLinks: mediaLinks as unknown as { [key: string]: string }[]
        };
      }
      break;
  }

  if (!campaignDetails) {
    throw new Response("Campaign details not found", { status: 404 });
  }

  const typedCampaignDetails: BaseCampaignDetails = {
    campaign_id: campaignDetails.campaign_id,
    created_at: campaignDetails.created_at,
    id: campaignDetails.id,
    script_id: campaignDetails.script_id,
    workspace: campaignDetails.workspace,
    script: campaignDetails.script,
    mediaLinks: campaignDetails.mediaLinks,
    message_media: campaignDetails.message_media,
    disposition_options: campaignDetails.disposition_options ?? undefined,
    questions: campaignDetails.questions ?? undefined,
    voicedrop_audio: campaignDetails.voicedrop_audio,
  };

  return json({
    workspace_id,
    selected_id,
    data: {
      ...campaignData,
      type: campaignData.type as CampaignType,
      campaignDetails: typedCampaignDetails
    },
    mediaNames,
    userRole: userRole?.role ?? "",
    scripts,
  } satisfies LoaderData);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const campaignId = params.selected_id;
  if (!campaignId) {
    throw new Response("Campaign ID is required", { status: 400 });
  }

  const formData = await request.formData();
  const mediaName = formData.get("fileName");
  const encodedMediaName = mediaName ? encodeURI(mediaName.toString()) : null;

  if (!encodedMediaName) {
    return json({ success: false, error: "File name is required" });
  }

  const { supabaseClient, headers, user } = await verifyAuth(request);

  const { data: campaign, error } = await supabaseClient
    .from("message_campaign")
    .select("id, message_media")
    .eq("campaign_id", parseInt(campaignId))
    .single();

  if (error) {
    logger.error("Campaign Error", error);
    return json({ success: false, error: error }, { headers });
  }

  const { data: campaignUpdate, error: updateError } = await supabaseClient
    .from("message_campaign")
    .update({
      message_media: campaign.message_media?.filter(
        (med) => med !== encodedMediaName,
      ) || [],
    })
    .eq("campaign_id", parseInt(campaignId))
    .select();

  if (updateError) {
    return json({ success: false, error: updateError }, { headers });
  }
  return json({ success: true, data: campaignUpdate }, { headers });
};

export default function ScriptEditor() {
  const { workspace_id, selected_id, mediaNames = [], scripts = [], data } =
    useLoaderData<typeof loader>();
  const [initData, setInitData] = useState<PageData>(data);
  const submit = useSubmit();
  const [pageData, setPageData] = useState<PageData>(data);
  const [isChanged, setChanged] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleSaveUpdate = async (saveScriptAsCopy: boolean) => {
    try {
      const formData = new FormData();
      formData.append('campaignData', JSON.stringify(pageData));
      formData.append('campaignDetails', JSON.stringify(pageData.campaignDetails));
      formData.append('scriptData', JSON.stringify(pageData.campaignDetails.script));
      formData.append('saveScriptAsCopy', saveScriptAsCopy.toString());

      submit(formData, {
        method: !saveScriptAsCopy ? "PATCH" : "POST",
        action: "/api/campaigns",
        navigate: false,
      });
      setInitData(pageData);
      setChanged(false);
      setShowSaveModal(false);
    } catch (error) {
      loggerClient.error("Error saving update:", error);
    }
  };

  const handleReset = () => {
    setPageData(data);
    setChanged(false);
  };

  const handlePageDataChange = (newPageData: PageData) => {
    setPageData(newPageData);
    const obj1 = normalizeScriptPageDataForComparison(initData);
    const obj2 = normalizeScriptPageDataForComparison(newPageData);
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    const obj1 = normalizeScriptPageDataForComparison(initData);
    const obj2 = normalizeScriptPageDataForComparison(pageData);
    setChanged(!deepEqual(obj1, obj2));
  }, [data, initData, pageData]);

  const renderCampaignSettingsScript = (mediaNames: string[] = []) => {
    if (!pageData.campaignDetails.script) return null;
    
    const scriptPageData = {
      campaignDetails: {
        ...pageData.campaignDetails,
        script: pageData.campaignDetails.script
      }
    };
    
    return (
      <CampaignSettingsScript
        pageData={scriptPageData}
        onPageDataChange={(newData) => {
          handlePageDataChange({
            ...pageData,
            campaignDetails: {
              ...pageData.campaignDetails,
              script: newData.campaignDetails.script,
            }
          });
        }}
        scripts={scripts}
        mediaNames={mediaNames}
      />
    );
  };

  return (
    <>
      <div className="relative flex h-full flex-col">
        <SaveBar
          isChanged={isChanged}
          onSave={() => setShowSaveModal(true)}
          onReset={handleReset}
        />
        <div className="h-full flex-grow p-4">
          {(pageData.type === "live_call") && renderCampaignSettingsScript([])}
          {(pageData.type === "robocall" ||
            pageData.type === "simple_ivr" ||
            pageData.type === "complex_ivr") && renderCampaignSettingsScript(mediaNames)}
          {pageData.type === "message" && (
            <MessageSettings
              mediaLinks={
                Array.isArray(pageData.campaignDetails.mediaLinks)
                  ? pageData.campaignDetails.mediaLinks.filter(
                      (link): link is string => typeof link === "string",
                    )
                  : []
              }
              details={pageData.campaignDetails}
              onChange={(field, value) => {
                handlePageDataChange({
                  ...pageData,
                  campaignDetails: {
                    ...pageData.campaignDetails,
                    [field]: value,
                  },
                });
              }}
              surveys={[]}
            />
          )}
        </div>
      </div>
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>
              Save {pageData.campaignDetails?.script?.name}
            </DialogTitle>
            <DialogDescription>
              Would you like to save changes to the existing{" "}
              {pageData.campaignDetails.script?.name}, or save as a copy?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => handleSaveUpdate(false)}
              className="mr-2"
              variant={"outline"}
            >
              Save
            </Button>
            <Button onClick={() => handleSaveUpdate(true)}>Save as Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
