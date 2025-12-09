import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { useState, useEffect } from "react";
import { verifyAuth } from "@/lib/supabase.server";
import CampaignSettingsScript from "@/components/campaign/settings/script/CampaignSettings.Script";
import { deepEqual } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getMedia,
  getRecordingFileNames,
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
import type { LoaderFunctionArgs } from "@remix-run/node";
import type { IVRCampaign, LiveCampaign, MessageCampaign, Script, User } from "@/lib/types";
import type { ActionFunctionArgs } from "@remix-run/node";

type CampaignType = "live_call" | "message" | "robocall" | "simple_ivr" | "complex_ivr";

type BaseCampaignDetails = {
  campaign_id: number | null;
  created_at: string;
  id: number;
  script_id: number | null;
  workspace: string;
  script?: Script;
  mediaLinks?: { [key: string]: string }[];
  message_media?: string[];
  disposition_options?: unknown;
  questions?: unknown;
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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  
  if (!workspace_id || !selected_id) {
    throw new Response("Missing required parameters", { status: 400 });
  }

  const { supabaseClient, user } = await verifyAuth(request);
  if (!user) {
    return redirect("/signin");
  }

  const userRole = getUserRole({ supabaseClient, user: user as unknown as User, workspaceId: workspace_id });
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
    console.error(campaignError);
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
        const fileNames = getRecordingFileNames(campaignDetails.script.steps);
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
    disposition_options: campaignDetails.disposition_options,
    questions: campaignDetails.questions,
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
    userRole,
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
    console.log("Campaign Error", error);
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
      console.error("Error saving update:", error);
    }
  };

  const handleReset = () => {
    setPageData(data);
    setChanged(false);
  };

  const handlePageDataChange = (newPageData: PageData) => {
    setPageData(newPageData);
    const obj1 = { ...initData };
    const obj2 = { ...newPageData };
    
    // Handle script updated_at field
    if (obj1.campaignDetails?.script) {
      obj1.campaignDetails.script = {
        ...obj1.campaignDetails.script,
        updated_at: null
      };
    }
    if (obj2.campaignDetails?.script) {
      obj2.campaignDetails.script = {
        ...obj2.campaignDetails.script,
        updated_at: null
      };
    }
    
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    const obj1 = { ...initData };
    const obj2 = { ...pageData };
    
    // Handle script updated_at field
    if (obj1.campaignDetails?.script) {
      obj1.campaignDetails.script = {
        ...obj1.campaignDetails.script,
        updated_at: null
      };
    }
    if (obj2.campaignDetails?.script) {
      obj2.campaignDetails.script = {
        ...obj2.campaignDetails.script,
        updated_at: null
      };
    }
    
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
            campaignDetails: newData.campaignDetails
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
        {isChanged && (
          <div className="fixed left-0 right-0 top-0 z-50 flex flex-col items-center justify-between bg-primary px-4 py-3 text-white shadow-md sm:flex-row sm:px-6 sm:py-5">
            <Button
              onClick={handleReset}
              className="mb-2 w-full rounded bg-white px-4 py-2 text-gray-500 transition-colors hover:bg-red-100 sm:mb-0 sm:w-auto"
            >
              Reset
            </Button>
            <div className="mb-2 text-center text-lg font-semibold sm:mb-0 sm:text-left">
              You have unsaved changes
            </div>
            <Button
              onClick={() => setShowSaveModal(true)}
              className="w-full rounded bg-secondary px-4 py-2 text-black transition-colors hover:bg-white sm:w-auto"
            >
              Save Changes
            </Button>
          </div>
        )}
        <div className="h-full flex-grow p-4">
          {(pageData.type === "live_call") && renderCampaignSettingsScript([])}
          {(pageData.type === "robocall" ||
            pageData.type === "simple_ivr" ||
            pageData.type === "complex_ivr") && renderCampaignSettingsScript(mediaNames)}
          {pageData.type === "message" && (
            <MessageSettings
              mediaLinks={pageData.campaignDetails.mediaLinks || []}
              details={pageData.campaignDetails}
              campaignData={pageData}
              onChange={handlePageDataChange}
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
