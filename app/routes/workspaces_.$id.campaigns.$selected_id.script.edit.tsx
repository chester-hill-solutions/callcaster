import { FaPlus } from "react-icons/fa";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext, useSubmit } from "@remix-run/react";
import { useMemo, useState, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import CampaignSettingsScript from "../components/CampaignSettings.Script";
import { deepEqual } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { getUserRole } from "~/lib/database.server";
import { MessageSettings } from "../components/MessageSettings";
import { IVRSettings } from "~/components/IVRSettings";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id, selected } = params;

  const { supabaseClient, headers, serverSession } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) {
    return redirect("/signin");
  }
  function getRecordingFileNames(data) {
    const fileNames = data.map((obj) => {
      if (
        obj.speechType === "recorded" &&
        obj.say !== "Enter your question here"
      ) {
        return obj.say;
      }
    });
    return fileNames.filter(Boolean);
  }
    async function getMedia(fileNames: Array<string>) {

    const media = await Promise.all(
      fileNames.map(async (mediaName) => {
        const { data, error } = await supabaseClient.storage
          .from("workspaceAudio")
          .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
        if (error) throw error;
        return { [mediaName]: data.signedUrl };
      }),
    );

    return media;
  }
  async function listMedia(workspace: string) {
    const { data, error } = await supabaseClient.storage
      .from(`workspaceAudio`)
      .list(workspace);
    if (error) console.error(error);
    return data;
  }
  const userRole = getUserRole({ serverSession, workspaceId: workspace_id });

  const { data: mtmData, error: mtmError } = await supabaseClient
    .from("campaign")
    .select(
      `*,
        campaign_audience(*)
        `,
    )
    .eq("id", selected_id);

  let data = [...mtmData];
  if (
    data.length > 0 &&
    (data[0].type === "live_call" || data[0].type === null)
  ) {
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("live_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);

    data = data.map((item) => ({
      ...item,
      campaignDetails,
    }));
    return json({
      workspace_id,
      selected_id,
      data,
      selected,
      mediaNames: await listMedia(workspace_id),
      userRole,
    });
  }
  if (data.length > 0 && data[0].type === "message") {
    let media;
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("message_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);
    if (campaignDetails?.message_media?.length > 0) {
      media = await Promise.all(
        campaignDetails.message_media.map(async (mediaName) => {
          const { data, error } = await supabaseClient.storage
            .from("messageMedia")
            .createSignedUrl(`${workspace_id}/${mediaName}`, 3600);
          if (error) throw error;
          return data.signedUrl;
        }),
      );
    }
    data = data.map((item) => ({
      ...item,
      campaignDetails: { ...campaignDetails, mediaLinks: media },
    }));
    return json({
      workspace_id,
      selected_id,
      selected,
    });
  }
  if (
    data.length > 0 &&
    (data[0].type === "robocall" ||
      data[0].type === "simple_ivr" ||
      data[0].type === "complex_ivr")
  ) {
    const { data: campaignDetails, error: detailsError } = await supabaseClient
      .from("ivr_campaign")
      .select()
      .eq("campaign_id", selected_id)
      .single();
    if (detailsError) console.error(detailsError);
    const fileNames = getRecordingFileNames(campaignDetails.step_data);
    let media = [];
    if (fileNames.length > 0) {
      media = await getMedia(fileNames);
    }
    data = data.map((item) => ({
      ...item,
      campaignDetails: { ...campaignDetails, mediaLinks: media },
    }));
    const mediaNames = await listMedia(workspace_id);
    return json({
      workspace_id,
      selected_id,
      mediaNames,
    });
  } else {
    return json({
      workspace_id,
      selected_id,
      mediaNames: [],
    });
  }
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
  const { workspace_id, selected_id, mediaNames } = useLoaderData();
  const data = useOutletContext();
  const submit = useSubmit();
  const [pageData, setPageData] = useState(data);
  const [isChanged, setChanged] = useState(false);

  const handleSaveUpdate = () => {
    let updateData;
    const body = pageData[0];
    const blocks = body.campaignDetails?.questions?.blocks;
    try {
      let updatedBlocks = {};
      if (blocks) {
        updatedBlocks = Object.entries(blocks).reduce((acc, [id, value]) => {
          const newId = value.title
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[\s~`!@#$%^&*(){}\[\];:"'<,.>?\/\\|_+=-]/g, "");

          acc[newId] = {
            ...value,
            id: newId,
          };
          return acc;
        }, {});
        updateData = {
          ...body,
          campaignDetails: {
            ...body.campaignDetails,
            questions: {
              ...body.campaignDetails.questions,
              blocks: updatedBlocks,
            },
          },
          id: selected_id,
        };
      } else {
        updateData = { ...body, id: parseInt(selected_id) };
      }
      setPageData([updateData]);
      submit(updateData, {
        method: "patch",
        encType: "application/json",
        navigate: false,
        action: "/api/campaigns",
      });
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
    setChanged(!deepEqual(newPageData, data));
  };

  useEffect(() => {
    setChanged(!deepEqual(pageData, data));
  }, [data, pageData]);

  return (
    <div className="relative flex h-full flex-col">
      {isChanged && (
        <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-primary px-6 py-5 text-white shadow-md">
          <Button
            onClick={handleReset}
            className="rounded bg-white px-4 py-2 text-gray-500 transition-colors hover:bg-red-100"
          >
            Reset
          </Button>
          <div className="text-lg font-semibold">You have unsaved changes</div>
          <Button
            onClick={handleSaveUpdate}
            className="rounded bg-secondary px-4 py-2 text-black transition-colors hover:bg-white "
          >
            Save Changes
          </Button>
        </div>
      )}
      {(pageData[0].type === "live_call" || pageData[0].type === null) && (
        <CampaignSettingsScript
          pageData={pageData[0]}
          onPageDataChange={(newData) => {
            handlePageDataChange([newData]);
          }}
        />
      )}
      {pageData.length > 0 &&
        (pageData[0].type === "robocall" ||
          pageData[0].type === "simple_ivr" ||
          pageData[0].type === "complex_ivr") && (
          <IVRSettings
            pageData={pageData}
            edit={true}
            mediaNames={mediaNames}
            onChange={(data) => setPageData([data])}
          />
        )}
      {pageData[0].type === "message" && (
        <MessageSettings
          pageData={pageData[0]}
          onPageDataChange={(newData) => handlePageDataChange([newData])}
          workspace_id={workspace_id}
          selected_id={selected_id}
        />
      )}
    </div>
  );
}
