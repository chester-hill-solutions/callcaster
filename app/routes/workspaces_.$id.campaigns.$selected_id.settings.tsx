import { json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import { Suspense } from "react";
import { FileObject } from "@supabase/storage-js";
import { useState, useCallback, SetStateAction, useEffect } from "react";
import { getSupabaseServerClientWithSession } from "~/lib/supabase.server";
import { CampaignSettings } from "../components/CampaignSettings";
import { fetchCampaignWithAudience } from "~/lib/database.server";
import { Session, SupabaseClient, User } from "@supabase/supabase-js";
import {
  Audience,
  Campaign,
  CampaignAudience,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  QueueItem,
  Script,
  WorkspaceNumbers,
} from "~/lib/types";
import { Spinner } from "~/components/ui/spinner";  
import { Json } from "~/lib/database.types";
import { Database } from "~/lib/database.types";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;
  
  const {
    supabaseClient,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);
  
  if (!serverSession?.user) return redirect("/signin");
  if (!selected_id) return redirect("../../");
  const campaignWithAudience = await fetchCampaignWithAudience(
    supabaseClient,
    selected_id,
  );
  return json({
    workspace_id,
    selected_id,
    campaignAudience: campaignWithAudience.campaign_audience,
    campaignQueue: campaignWithAudience.campaign_queue,
  });
};

export default function Settings() {
  const {
    data,
    phoneNumbers,
    mediaData,
    scripts,
    user,
    mediaLinks,
    audiences,
    joinDisabled,
    flags,
  }: {
    data: Campaign & {
      campaignDetails: LiveCampaign & { script: Script } | MessageCampaign | IVRCampaign & { script: Script };
    };
    phoneNumbers: WorkspaceNumbers[];
    mediaData: FileObject[];
    scripts: Script[];
    user: User;
    mediaLinks: string[];
    audiences: Audience[];
    joinDisabled: string | null,
    flags: Flags;
  } = useOutletContext();
  const {
    workspace_id,
    selected_id,
    campaignAudience,
    campaignQueue,
  } = useLoaderData<typeof loader>();

  const [pageData, setPageData] = useState({
    ...data,
    campaign_audience: campaignAudience,
    campaign_queue: campaignQueue,
  });
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
      setPageData(newData as any); 
    },
    [],
  );

  return (
    <CampaignSettings
      flags={flags}
      workspace={workspace_id || ''}
      data={pageData as any}
      isActive={data.status === 'running'} 
      scripts={scripts}
      audiences={audiences}
      mediaData={mediaData}
      campaign_id={selected_id || ''}
      phoneNumbers={phoneNumbers}
      campaignDetails={data.campaignDetails}
      onPageDataChange={handlePageDataChange}
      user={user}
      joinDisabled={joinDisabled}
      campaignQueue={campaignQueue} 
      mediaLinks={mediaLinks}
    />
  );
}
