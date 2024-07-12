import { FaPlus } from "react-icons/fa";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignSettingsScript from "../components/CampaignSettings.Script";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  getMedia,
  getRecordingFileNames,
  getSignedUrls,
  getUserRole,
  getWorkspaceScripts,
  listMedia,
} from "~/lib/database.server";
import { MessageSettings } from "../components/MessageSettings";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }

  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });
  const scripts = await getWorkspaceScripts({
    workspace: workspace_id,
    supabase: supabaseClient,
  });

  const { data: campaignData, error: campaignError } = await supabaseClient
    .from("campaign")
    .select(`*, campaign_audience(*)`)
    .eq("id", selected_id)
    .single();

  if (campaignError) {
    console.error(campaignError);
    throw new Response("Error fetching campaign data", { status: 500 });
  }

  let campaignDetails, mediaNames;

  switch (campaignData.type) {
    case "live_call":
    case null:
      ({ data: campaignDetails } = await supabaseClient
        .from("live_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", selected_id)
        .single());
      mediaNames = await listMedia(supabaseClient, workspace_id);
      break;

    case "message":
      ({ data: campaignDetails } = await supabaseClient
        .from("message_campaign")
        .select()
        .eq("campaign_id", selected_id)
        .single());
      if (campaignDetails?.message_media?.length > 0) {
        campaignDetails.mediaLinks = await getSignedUrls(
          supabaseClient,
          workspace_id,
          campaignDetails.message_media,
        );
      }
      break;

    case "robocall":
    case "simple_ivr":
    case "complex_ivr":
      ({ data: campaignDetails } = await supabaseClient
        .from("ivr_campaign")
        .select(`*, script(*)`)
        .eq("campaign_id", selected_id)
        .single());
      const fileNames = getRecordingFileNames(campaignDetails.step_data);
      campaignDetails.mediaLinks = await getMedia(
        fileNames,
        supabaseClient,
        workspace_id,
      );
      mediaNames = await listMedia(supabaseClient, workspace_id);
      break;

    default:
      throw new Response("Invalid campaign type", { status: 400 });
  }

  return json({
    workspace_id,
    selected_id,
    data: { ...campaignData, campaignDetails },
    mediaNames,
    userRole,
    scripts,
  });
};

export const action = async ({ request, params }) => {
  const campaignId = params.selected_id;
  const formData = await request.formData();
  const mediaName = formData.get("fileName");
  const encodedMediaName = encodeURI(mediaName);

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  const { data: campaign, error } = await supabaseClient
    .from("message_campaign")
    .select("id, message_media")
    .eq("campaign_id", campaignId)
    .single();
  if (error) {
    console.log("Campaign Error", error);
    return json({ success: false, error: error }, { headers });
  }
  const { data: campaignUpdate, error: updateError } = await supabaseClient
    .from("message_campaign")
    .update({
      message_media: campaign.message_media.filter(
        (med) => med !== encodedMediaName,
      ),
    })
    .eq("campaign_id", campaignId)
    .select();

  if (updateError) {
    console.log(updateError);
    return json({ success: false, error: updateError }, { headers });
  }
  return json({ success: false, error: updateError }, { headers });
};

export default function ScriptEditor() {
  const { workspace_id, selected_id, mediaNames, scripts, data } =
    useLoaderData();
  const [initData, setInitData] = useState(data);
  const submit = useSubmit();
  const [pageData, setPageData] = useState(initData);
  const [isChanged, setChanged] = useState(false);

  const handleSaveUpdate = () => {
    let updateData;
    const body = pageData;
    try {
      updateData = { ...body, id: parseInt(selected_id) };
      submit(updateData, {
        method: "patch",
        encType: "application/json",
        navigate: false,
        action: "/api/campaigns",
      });
      setInitData(updateData);
      setPageData(updateData);
      setChanged(false);
    } catch (error) {
      console.log(error);
    }
  };

  const handleReset = () => {
    setPageData(data);
    setChanged(false);
  };

  const handlePageDataChange = (newPageData) => {
    setPageData(newPageData);
    let obj1 = initData;
    let obj2 = newPageData;
    delete obj1.campaignDetails.script?.updated_at;
    delete obj2.campaignDetails.script?.updated_at;
    setChanged(!deepEqual(obj1, obj2));
  };

  useEffect(() => {
    let obj1 = initData;
    let obj2 = pageData;
    delete obj1.campaignDetails.script?.updated_at;
    delete obj2.campaignDetails.script?.updated_at;
    setChanged(!deepEqual(obj1, obj2));
  }, [data, initData, pageData]);

  return (
    <div className="relative flex h-full overflow-visible flex-col">
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
            onClick={handleSaveUpdate}
            className="w-full rounded bg-secondary px-4 py-2 text-black transition-colors hover:bg-white sm:w-auto"
          >
            Save Changes
          </Button>
        </div>
      )}
      <div className="flex-grow p-4">
        {(pageData.type === "live_call" || pageData.type === null) && (
          <CampaignSettingsScript
            pageData={pageData}
            onPageDataChange={(newData) => {
              handlePageDataChange(newData);
            }}
            scripts={scripts}
          />
        )}
        {(pageData.type === "robocall" ||
          pageData.type === "simple_ivr" ||
          pageData.type === "complex_ivr") && (
          <CampaignSettingsScript
            pageData={pageData}
            onPageDataChange={(newData) => {
              handlePageDataChange(newData);
            }}
            scripts={scripts}
            mediaNames={mediaNames}
          />
        )}
        {pageData.type === "message" && (
          <MessageSettings
            pageData={pageData}
            onPageDataChange={(newData) => handlePageDataChange(newData)}
            workspace_id={workspace_id}
            selected_id={selected_id}
          />
        )}
      </div>
    </div>
  );
}
