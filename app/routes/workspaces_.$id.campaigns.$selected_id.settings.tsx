import { json, redirect } from "@remix-run/node";
import { Await, useLoaderData, useOutletContext } from "@remix-run/react";
import { FileObject } from "@supabase/storage-js";
import { useState, useCallback, SetStateAction, Suspense } from "react";
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
import { Json, Database } from "~/lib/database.types";

export const loader = async ({ request, params }) => {
  const { id: workspace_id, selected_id } = params;

  const {
    supabaseClient,
    serverSession,
  }: { supabaseClient: SupabaseClient; serverSession: Session } =
    await getSupabaseServerClientWithSession(request);
  if (!serverSession?.user) return redirect("/signin");
  const campaignWithAudience = await fetchCampaignWithAudience(
    supabaseClient,
    selected_id,
  );
  const { data: queuePromise, error: queueError } = await supabaseClient.from("campaign_queue").select("*, contact(*)").eq("campaign_id", selected_id);

  if (queueError) throw new Error(`Error fetching queue: ${queueError.message}`);
  return json({
    workspace_id,
    selected_id,
    campaignAudience: campaignWithAudience.campaign_audience,
    queuePromise,
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
    queuePromise,
  }: {
    workspace_id: string;
    selected_id: string;
    campaignAudience: Audience;
    queuePromise: Promise<QueueItem[]>;
  } = useLoaderData();

  const [pageData, setPageData] = useState({
    ...data,
    campaign_audience: campaignAudience,
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
      setPageData(newData);
    },
    [],
  );
  return (
    <>
      <CampaignSettings
        flags={flags}
        workspace={workspace_id}
        data={pageData}
        scripts={scripts}
        audiences={audiences}
        mediaData={mediaData}
        campaign_id={selected_id}
        phoneNumbers={phoneNumbers}
        campaignDetails={data.campaignDetails}
        onPageDataChange={handlePageDataChange}
        user={user}
        joinDisabled={joinDisabled}
        mediaLinks={mediaLinks}
      />
{/*       <Suspense fallback={<div>Loading queue...</div>}>
        <Await resolve={queuePromise}>
          {(queue) => {
            console.log(queue);
            return (<div>
              {queue.map((item) => <div key={item.id}>{item.contact?.firstname} {item.contact?.surname} {item.contact?.phone} {item.status}</div>)}
            </div>);
          }}
        </Await>
      </Suspense>
 */}    </>
  );
}
