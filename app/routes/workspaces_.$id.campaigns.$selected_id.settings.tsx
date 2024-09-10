import { defer, json, redirect } from "@remix-run/node";
import { Params, useLoaderData, useOutletContext } from "@remix-run/react";
import { FileObject } from "@supabase/storage-js";
import { useState, useCallback, SetStateAction } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import {
  fetchAdvancedCampaignDetails,
  fetchCampaignWithAudience,
  getMedia,
  getRecordingFileNames,
  getSignedUrls,
  getWorkspacePhoneNumbers,
  getWorkspaceScripts,
} from "~/lib/database.server";
import { Session, SupabaseClient, User } from "@supabase/supabase-js";
import {
  Audience,
  Campaign,
  CampaignAudience,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Script,
  WorkspaceNumbers,
} from "~/lib/types";
import { Json, Database } from "~/lib/database.types";

export const loader = async ({
  request,
  params,
}: {
  request: Request;
  params: Params;
}) => {
  const { id: workspace_id, selected_id } = params;

  const {
    supabaseClient,
    serverSession,
  }: { supabaseClient: SupabaseClient; serverSession: Session } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) return redirect("/signin");

  try {
    const [campaignData, { data: phoneNumbers }, { data: mediaData }, scripts] =
      await Promise.all([
        fetchCampaignWithAudience(supabaseClient, selected_id),
        getWorkspacePhoneNumbers({ supabaseClient, workspaceId: workspace_id }),
        supabaseClient.storage.from("workspaceAudio").list(workspace_id),
        getWorkspaceScripts({
          workspace: workspace_id,
          supabase: supabaseClient,
        }),
      ]);
    const campaignDetails = await fetchAdvancedCampaignDetails(
      supabaseClient,
      selected_id,
      campaignData.type,
      workspace_id,
    );
    let mediaLinksPromise;

    if (
      campaignData.type === "message" &&
      campaignDetails?.message_media?.length > 0
    ) {
      mediaLinksPromise = getSignedUrls(
        supabaseClient,
        workspace_id,
        campaignDetails.message_media,
      );
    }
    if (campaignData.type === "robocall") {
      mediaLinksPromise = getMedia(
        getRecordingFileNames(campaignDetails.step_data),
        supabaseClient,
        workspace_id,
      );
      
    }
    return defer({
      workspace_id,
      selected_id,
      data: campaignData,
      scripts,
      mediaData,
      mediaLinks: mediaLinksPromise,
      phoneNumbers,
      campaignDetails,
      user: serverSession.user,
    });
  } catch (error) {
    console.error("Error in campaign loader:", error);
    throw new Response("Error loading campaign data", { status: 500 });
  }
};

export default function Settings() {
  const { audiences }: { audiences: Audience[] } = useOutletContext();
  const {
    workspace_id,
    selected_id,
    data,
    mediaData,
    phoneNumbers,
    campaignDetails,
    scripts,
    user,
    mediaLinks,
  }: {
    workspace_id: string;
    selected_id: string;
    data: Campaign & { campaign_audience: CampaignAudience };
    mediaData: FileObject[];
    phoneNumbers: WorkspaceNumbers[];
    campaignDetails:
      | (LiveCampaign & { script: Script })
      | (IVRCampaign & { script: Script })
      | MessageCampaign;
    scripts: Script[];
    user: User;
    mediaLinks: any[];
  } = useLoaderData();
  const [pageData, setPageData] = useState(data);
  const handlePageDataChange = useCallback(
    (
      newData: SetStateAction<
        {
          call_questions: Json | null;
          caller_id: string;
          created_at: string;
          dial_ratio: number;
          dial_type: Database["public"]["Enums"]["dial_types"] | null;
          end_date: string | null;
          group_household_queue: boolean;
          id: number;
          start_date: string | null;
          status: Database["public"]["Enums"]["campaign_status"] | null;
          title: string;
          type: Database["public"]["Enums"]["campaign_type"] | null;
          voicemail_file: string | null;
          workspace: string | null;
        } & { campaign_audience: CampaignAudience }
      >,
    ) => {
      setPageData(newData);
    },
    [],
  );
  return (
    <>
      <CampaignSettings
        workspace={workspace_id}
        data={pageData}
        scripts={scripts}
        audiences={audiences}
        mediaData={mediaData}
        campaign_id={selected_id}
        phoneNumbers={phoneNumbers}
        campaignDetails={campaignDetails}
        onPageDataChange={handlePageDataChange}
        user={user}
        mediaLinks={mediaLinks}
      />
    </>
  );
}
