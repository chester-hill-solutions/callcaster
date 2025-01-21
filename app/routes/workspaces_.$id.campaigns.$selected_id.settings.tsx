import { defer, json, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { FetcherWithComponents, NavLink, useFetcher, useLoaderData, useNavigate, useOutletContext } from "@remix-run/react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

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
  scheduleDisabled: string | boolean;
  credits: number;
}

const utcToLocal = (utcTime: string) => {
  if (!utcTime) return "";
  const [hours, minutes] = utcTime.split(":");
  const date = new Date();
  date.setUTCHours(Number(hours));
  date.setUTCMinutes(Number(minutes));
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const localToUTC = (localTime: string) => {
  if (!localTime) return "";
  const [hours, minutes] = localTime.split(":");
  const date = new Date();
  date.setHours(Number(hours));
  date.setMinutes(Number(minutes));
  return date.toUTCString().slice(17, 22);
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { id: workspace_id, selected_id } = params;

  const {
    supabaseClient,
    serverSession,
  } = await getSupabaseServerClientWithSession(request);

  if (!serverSession?.user) return redirect("/signin");
  if (!selected_id) return redirect("../../");
  if (!workspace_id) return redirect("../../");
  const campaignWithAudience = await fetchCampaignWithAudience(supabaseClient, selected_id, workspace_id  );
  const {data: mediaData} = await supabaseClient.storage.from("workspaceAudio").list(`${workspace_id}`);
  const {data:phoneNumbers} = await supabaseClient.from("workspace_number").select("*").eq("workspace", workspace_id);
  const mediaLinksPromise = Promise.resolve(mediaData?.map((media) => media.name)).then((mediaNames) => mediaNames?.filter((media) => !media.startsWith("voicemail-")));

  return defer({
    workspace_id,
    selected_id,
    campaignAudience: campaignWithAudience.campaign_audience,
    campaignQueue: campaignWithAudience.campaign_queue,
    queueCount: campaignWithAudience.queue_count,
    totalCount: campaignWithAudience.total_count,
    scripts: campaignWithAudience.scripts,
    mediaData: mediaData?.filter((media) => !media.name.startsWith("voicemail-")),
    phoneNumbers,
    user:serverSession.user,  
    mediaLinks: mediaLinksPromise,
  });
};

export default function Settings() {
  const {
    supabase,
    joinDisabled,
    audiences,
    campaignData,
    campaignDetails,
    flags,
    scheduleDisabled,
    credits
  } = useOutletContext<Context>();

  const {
    workspace_id,
    selected_id,
    campaignAudience,
    campaignQueue,
    queueCount,
    totalCount,
    scripts,
    mediaData,
    phoneNumbers,
    user,
    mediaLinks,
  } = useLoaderData<typeof loader>();

  const duplicateFetcher = useFetcher<{ campaign: { id: string } }>();
  const formFetcher: FetcherWithComponents<{ campaign: Campaign, campaignDetails: CampaignDetails }> = useFetcher<{ campaign: Campaign, campaignDetails: CampaignDetails }>();
  const navigate = useNavigate();

  const {
    campaignData: campaignSettingsData,
    isChanged,
    handleInputChange,
    handleAudienceChange,
    handleStatusButtons,
    handleResetData,
    handleUpdateData,
    getScheduleData,
    getActiveChangeData,
    confirmStatus,
    setConfirmStatus
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
    script_id: campaignDetails?.script_id || null,
    audiences: campaignData?.audiences || [],
    body_text: campaignDetails?.body_text || null,
    message_media: campaignDetails?.message_media || null,
    voicedrop_audio: campaignDetails?.voicedrop_audio || null,
    schedule: campaignData?.schedule || null,
    is_active: campaignData?.is_active || false,
    details: campaignDetails,
  });

  const handleConfirmStatus = (status: "schedule" | "play" | "archive" | "none") => {
    setConfirmStatus(status);
  }

  const handleScheduleButton = (event: React.FormEvent<HTMLFormElement> | null = null) => {
    if (event) {
      event.preventDefault();
    }
    const data = getScheduleData();
    formFetcher.submit(data, {
      method: "patch",
      action: "/api/campaigns",
    });
    navigate("..");
  };

  const handleActiveChange = (isActive: boolean, status: string | null) => {
    const data = getActiveChangeData(isActive, status);
    formFetcher.submit(data, {
      method: "patch",
      action: "/api/campaigns",
    });
  };

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
      };
      handleUpdateData(updatedData);
    }
  }, [formFetcher.data, campaignSettingsData]);

  const confirmDescription = confirmStatus === "schedule" ? (
    <div className="space-y-4">
      <p className="font-medium text-lg">
        Schedule this campaign to start on {campaignData?.start_date ? new Date(campaignData.start_date).toLocaleString().split(',').join(' at') : "a date in the future"} ending at {campaignData?.end_date ? new Date(campaignData.end_date).toLocaleString().split(',').join(' at') : "a date in the future"}
      </p>

      <div className="rounded-lg border p-4">
        <h3 className="font-medium mb-3">Calling Hours</h3>
        <div className="grid grid-cols-7 gap-1 text-xs">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center font-medium p-1">{day}</div>
          ))}
          {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day) => {
            const schedule = campaignData.schedule?.[day];
            return (
              <div
                key={day}
                className={`text-center p-1 rounded ${schedule?.active ? 'bg-primary/10 text-primary' : 'bg-muted'}`}
              >
                {schedule?.active ? (
                  <div className="space-y-1">
                    {schedule.intervals.map((interval, idx) => (
                      <div key={idx} className="text-[10px]">
                        {utcToLocal(interval.start)}-{utcToLocal(interval.end)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg bg-muted p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-primary">💰</span>
          <div>
            <p className="font-medium">Credits Available: {credits}</p>
            <p className="text-sm text-muted-foreground">
              Cost: {campaignData?.type === "message" ? "1 credit per message" : "1 credit per dial + 1 credit per minute after first minute"}
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
              Estimated cost: {queueCount} - {(queueCount || 0) * 2} credits
              {(queueCount || 0) > credits && (
                <span className="text-destructive"> (Exceeds available credits)</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {(queueCount || 0) > credits && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          ⚠️ Warning: Your campaign will be paused when you run out of credits
        </div>
      )}
    </div>
  ) : confirmStatus === "play" ? (
    <div className="space-y-4">
      <p className="font-medium text-lg">
        Are you sure you want to start this campaign? {campaignData?.type === "live_call" ? "This will make your campaign active and available for callers."
          : campaignData?.type === "message" ? "This will begin sending messages to your contacts." : "This will begin dialing contacts automatically."}
      </p>

      <div className="rounded-lg bg-muted p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-primary">💰</span>
          <div>
            <p className="font-medium">Credits Available: {credits}</p>
            <p className="text-sm text-muted-foreground">Cost: {campaignData?.type === "message" ? "1 credit per message" : "1 credit per dial + 1 credit per minute after first minute"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-primary">📞</span>
          <div>
            <p className="font-medium">Contacts to {campaignData?.type === "message" ? "Message" : "Dial"}: {queueCount}</p>
            <p className="text-sm text-muted-foreground">
              Estimated cost: {queueCount} - {(queueCount || 0) * 2} credits
              {(queueCount || 0) > credits &&
                <span className="text-destructive"> (Exceeds available credits)</span>
              }
            </p>
          </div>
        </div>
      </div>

      {(queueCount || 0) > credits && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          ⚠️ Warning: Your campaign will be paused when you run out of credits
        </div>
      )}
    </div>
  ) : confirmStatus === "archive" ? (
    "Are you sure you want to archive this campaign? It will be hidden from your campaigns list, and can't be undone."
  ) : "";

  return (
    <><CampaignSettings
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
      scheduleDisabled={scheduleDisabled}
      handleConfirmStatus={handleConfirmStatus}
      confirmStatus={confirmStatus} />

      <Dialog open={confirmStatus != "none"} onOpenChange={(e) => handleConfirmStatus(e ? confirmStatus : "none")}>
        <DialogContent className="flex w-[450px] flex-col items-center bg-card">
          <DialogTitle className="text-center font-Zilla-Slab text-2xl">
            Confirm {confirmStatus}
          </DialogTitle>
          <DialogDescription>{confirmDescription}</DialogDescription>
          <DialogFooter className="flex flex-1 w-full gap-2 justify-end">
            <Button variant="outline" className="border-primary" onClick={() => handleConfirmStatus("none")}>Cancel</Button>
            <Button onClick={() => {
              if (confirmStatus === "none") {
                return
              }
              handleStatusButtons(confirmStatus)
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog></>

  );
}
