import { json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useOutletContext } from "@remix-run/react";
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
import useCampaignSettings, { CampaignSettingsData } from "~/hooks/useCampaignSettings";

type CampaignDetails = LiveCampaign | MessageCampaign | IVRCampaign

type Context = {
  supabase: SupabaseClient;
  joinDisabled: string | null;
  audiences: Audience[];
  campaignData: Campaign
  campaignDetails: CampaignDetails
  phoneNumbers: WorkspaceNumbers[];
  mediaData: FileObject[];
  scripts: Script[];
  user: User;
  mediaLinks: string[];
  flags: Flags;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;

  const {
    supabaseClient,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);

  if (!serverSession?.user) return redirect("/signin");
  if (!selected_id) return redirect("../../");

  const campaignWithAudience = await fetchCampaignWithAudience(supabaseClient, selected_id);
  return json({
    workspace_id,
    selected_id,
    campaignAudience: campaignWithAudience.campaign_audience,
    campaignQueue: campaignWithAudience.campaign_queue,
    queueCount: campaignWithAudience.queue_count,
    totalCount: campaignWithAudience.total_count,
  });
};

export default function Settings() {
  const {
    campaignData,
    campaignDetails,
    phoneNumbers,
    mediaData,
    scripts,
    user,
    mediaLinks,
    audiences,
    joinDisabled,
    flags,
  } = useOutletContext<Context>();

  const {
    workspace_id,
    selected_id,
    campaignAudience,
    campaignQueue,
    queueCount,
    totalCount,
  } = useLoaderData<typeof loader>();

  const duplicateFetcher = useFetcher<{ campaign: { id: string } }>();
  const formFetcher = useFetcher<{ campaign: Campaign, campaignDetails: CampaignDetails }>();
  const navigate = useNavigate();

  const {
    campaignData: campaignSettingsData,
    isChanged,
    handleInputChange,
    handleActiveChange,
    handleAudienceChange,
    handleScheduleButton,
    handleStatusButtons,
    handleResetData,
    handleUpdateData
  } = useCampaignSettings({
    campaign_id: selected_id || '',
    workspace: workspace_id || '',
    title: campaignData?.title || '',
    status: campaignData?.status || 'draft',
    type: campaignData?.type || 'live_call',
    dial_type: campaignData?.dial_type || 'call',
    group_household_queue: campaignData?.group_household_queue || false,
    start_date: campaignData?.start_date || new Date().toISOString(),
    end_date: campaignData?.end_date || new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    caller_id: campaignData?.caller_id || null,
    voicemail_file: campaignData?.voicemail_file || null,
    script_id: campaignData?.script_id || null,
    audiences: campaignData?.audiences || [],
    body_text: campaignData?.body_text || null,
    message_media: campaignData?.message_media || null,
    voicedrop_audio: campaignData?.voicedrop_audio || null,
    schedule: campaignData?.schedule || null,
    is_active: campaignData?.is_active || false,
    campaign_audience: campaignAudience || null,
    details: campaignDetails
  });

  const handleSave = () => {
    formFetcher.submit(
      { campaignData: JSON.stringify({ ...campaignSettingsData, is_active: campaignSettingsData.is_active }), campaignDetails: JSON.stringify(campaignDetails) },
      { method: "patch", action: "/api/campaigns" }
    );
  }

  const handleDuplicateButton = () => {
    const { campaign_id, ...dataToDuplicate } = campaignSettingsData;
    duplicateFetcher.submit(
      { campaignData: JSON.stringify(dataToDuplicate) },
      { method: "post", action: "/api/campaigns" }
    );
  }

  const handleNavigate = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    navigate(e.currentTarget.value);
  }

  useEffect(() => {
    if (duplicateFetcher.data?.campaign) {
      navigate(`/workspaces/${workspace_id}/campaigns/${duplicateFetcher.data.campaign.id}/settings`);
    }
  }, [duplicateFetcher.data]);

  useEffect(() => {
    if (formFetcher.data) {
      const updatedData = {
        ...campaignSettingsData,
        campaign_audience: campaignAudience?.[0] ? {
          audience_id: campaignAudience[0].audience_id,
          campaign_id: Number(selected_id),
          created_at: new Date().toISOString()
        } : null
      };
      handleUpdateData(updatedData);
    } 
  }, [formFetcher.data, campaignSettingsData]);

  return (
    <CampaignSettings
      flags={flags}
      workspace={workspace_id || ''}
      campaignData={campaignSettingsData}
      campaignDetails={campaignDetails}
      isActive={campaignSettingsData.status === 'running'}
      scripts={scripts}
      audiences={audiences}
      mediaData={mediaData}
      campaign_id={selected_id || ''}
      phoneNumbers={phoneNumbers}
      isChanged={isChanged}
      handleInputChange={handleInputChange}
      handleDuplicateButton={handleDuplicateButton}
      handleSave={handleSave}
      handleResetData={handleResetData}
      handleActiveChange={handleActiveChange}
      handleAudienceChange={handleAudienceChange}
      handleScheduleButton={handleScheduleButton}
      handleStatusButtons={handleStatusButtons}
      formFetcher={formFetcher}
      user={user}
      joinDisabled={joinDisabled}
      campaignQueue={campaignQueue}
      queueCount={queueCount || 0}
      totalCount={totalCount || 0}
      mediaLinks={mediaLinks}
      handleNavigate={handleNavigate}
    />
  );
}
