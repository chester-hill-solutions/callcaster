import { useState, useEffect, useMemo, FormEvent } from "react";
import { useNavigate, useNavigation, useFetcher, Form } from "@remix-run/react";
import { FileObject } from "@supabase/storage-js";
import { Button } from "./ui/button";
import { deepEqual } from "~/lib/utils";
import {
  Audience,
  Campaign,
  CampaignAudience,
  Contact,
  Flags,
  IVRCampaign,
  LiveCampaign,
  MessageCampaign,
  Schedule,
  Script,
  WorkspaceNumbers,
  Queue,
} from "~/lib/types";
import { User } from "@supabase/supabase-js";
import { CampaignBasicInfo } from "./CampaignBasicInfo";
import { CampaignTypeSpecificSettings } from "./CampaignDetailed";
import { AudienceSelection } from "./CampaignAudienceSelection";
import { SaveBar } from "./SaveBar";

export type CampaignSettingsProps = {
  campaign_id: string;
  data: Campaign & { campaign_audience: CampaignAudience };
  audiences: Audience[];
  mediaData: FileObject[];
  workspace: string;
  phoneNumbers: WorkspaceNumbers[];
  campaignDetails:
  | (LiveCampaign | IVRCampaign) & { script: Script }
  | MessageCampaign;
  scripts: Script[];
  user: User;
  mediaLinks: string[];
  campaignQueue: (Queue & { contact: Contact })[];
  joinDisabled: string | null;
  flags: Flags;
  isActive: boolean;
  onPageDataChange: (
    data: Campaign & { campaign_audience: CampaignAudience },
  ) => void;
};

export type CampaignSettingsData = {
  campaign_id: string;
  workspace: string;
  title: string;
  status: string;
  type: "live_call" | "message" | "robocall";
  dial_type: "call" | "predictive";
  group_household_queue: boolean;
  start_date: string;
  end_date: string;
  caller_id: string | null;
  voicemail_file: string | null;
  script_id: number | string | null;
  audiences: CampaignAudience[];
  body_text: string;
  message_media: string[];
  queue_count: number;
  voicedrop_audio: string | null;
  schedule: Schedule;
};

export const CampaignSettings = ({
  campaign_id,
  data,
  audiences = [],
  mediaData,
  workspace,
  phoneNumbers = [],
  campaignDetails: details,
  scripts,
  user,
  onPageDataChange,
  mediaLinks,
  joinDisabled,
  queueCount,
  totalCount,
  flags,
  campaignQueue
}: CampaignSettingsProps) => {
  const navigate = useNavigate();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const formFetcher = useFetcher();
  const [campaignData, setCampaignData] = useState(() => ({
    campaign_id,
    workspace,
    title: data?.title || "",
    status: data?.status || "",
    type: data?.type || "live_call",
    dial_type: data?.dial_type || "call",
    group_household_queue: data?.group_household_queue || false,
    start_date: data?.start_date || new Date().toISOString(),
    end_date:
      data?.end_date ||
      new Date(Date.now() + 24 * 60 * 60 * 1000 * 30).toISOString(),
    caller_id: data?.caller_id || "",
    voicemail_file: data?.voicemail_file || "",
    script_id: details && 'script_id' in details ? details.script_id : null,
    audiences: data?.campaign_audience ? [data.campaign_audience].flat() : [],
    body_text: details?.body_text || "",
    message_media: details?.message_media || [],
    voicedrop_audio: details?.voicedrop_audio,
    schedule: data?.schedule || {},
    queue_count: queueCount,
    total_count: totalCount,
    is_active: data?.is_active || false
  }));
  const [initialData, setInitial] = useState(campaignData);

  const [isChanged, setChanged] = useState(false);

  useEffect(() => {
    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);

    setInitial({
      campaign_id,
      workspace,
      queue_count: queueCount,
      title: data?.title || "",
      status: data?.status || "",
      type: data?.type || "live_call",
      dial_type: data?.dial_type || "call",
      group_household_queue: data?.group_household_queue || false,
      start_date: data?.start_date || today.toISOString(),
      end_date: data?.end_date || thirtyDaysLater.toISOString(),
      caller_id: data?.caller_id || "",
      voicemail_file: data?.voicemail_file || "",
      script_id: details && 'script_id' in details ? details.script_id : null,
      audiences: data?.campaign_audience ? [data.campaign_audience].flat() : [],
      body_text: details?.body_text || "",
      message_media: details?.message_media || [],
      voicedrop_audio: details?.voicedrop_audio,
      schedule: data?.schedule || {},
      is_active: data?.is_active || false,
      total_count: totalCount 
    });
  }, [campaign_id, data, details, workspace]);

  useEffect(() => {
    setChanged(!deepEqual(campaignData, initialData));
  }, [campaignData, initialData]);

  useEffect(() => {
    if (formFetcher.data) {
      onPageDataChange({
        ...campaignData,
        campaign_audience: campaignData.audiences[0],
        queue_count: queueCount,
        total_count: totalCount 
      });
      setChanged(!deepEqual(campaignData, initialData));
    }
  }, [formFetcher.data]);

  const handleInputChange = (name: string, value: string | boolean | number | null | Schedule) => {
    setCampaignData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAudience = (audience: Audience | null, isChecked: boolean) => {
    if (!audience) return;
    
    setCampaignData((prev) => ({
      ...prev,
      audiences: isChecked
        ? [
          ...prev.audiences,
          {
            audience_id: audience.id,
            campaign_id: parseInt(campaign_id),
            created_at: audience.created_at,
          },
        ]
        : prev.audiences.filter((aud) => aud.audience_id !== audience.id),
    }));
  };

  const handleActivateButton = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (campaignData.type === "live_call") {
      formFetcher.submit(
        {
          campaignData: JSON.stringify({ ...campaignData, status: "running", is_active: true }),
          campaignDetails: JSON.stringify(details),
        },
        {
          method: "patch",
          action: "/api/campaigns",
        },
      );
      navigate("../call");
    } else if (campaignData.type === "robocall") {
      handleInputChange("status", "running");
      fetcher.submit(
        { campaign_id, user_id: user.id, workspace_id: workspace },
        {
          method: "post",
          action: "/api/initiate-ivr",
          encType: "application/json",
        },
      );
      navigate("..");
    } else if (campaignData.type === "message" && details) {
      handleInputChange("status", "running");
      fetcher.submit(
        {
          campaign_id,
          workspace_id: details.workspace,
          caller_id: campaignData.caller_id,
          user_id: user.id,
        },
        { method: "post", action: "/api/sms", encType: "application/json" },
      );
      navigate(`../../../chats?campaign_id=${campaign_id}`);
    }
  };

  const handleScheduleButton = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    formFetcher.submit(
      {
        campaignData: JSON.stringify({ ...campaignData, status: "scheduled" }),
        campaignDetails: JSON.stringify(details),
      },
      {
        method: "patch",
        action: "/api/campaigns",
      },
    );
    navigate("..");
  };

  const handleActiveChange = (isActive: boolean, status: string | null) => {
    formFetcher.submit(
      {
        campaignData: JSON.stringify({ ...campaignData, is_active: isActive, ...(status && { status }) }),
        campaignDetails: JSON.stringify(details),
      },
      {
        method: "patch",
        action: "/api/campaigns",
      },
    );
  }

  const clearSchedule = () => {
    handleInputChange("schedule", {
      sunday: { active: false, intervals: [] },
      monday: { active: false, intervals: [] },
      tuesday: { active: false, intervals: [] },
      wednesday: { active: false, intervals: [] },
      thursday: { active: false, intervals: [] },
      friday: { active: false, intervals: [] },
      saturday: { active: false, intervals: [] },
    });
  };

  const handleStatusButtons = (
    type: "play" | "pause" | "archive" | "schedule",
  ) => {
    const status = campaignData.status;
    switch (status) {
      case "draft":
        if (type === "play") {
          handleInputChange("status", "running");
          handleActiveChange(true, "running");
        } else if (type === "schedule") {
          handleInputChange("status", "scheduled");
        } else if (type === "archive") {
          clearSchedule();
          handleInputChange("status", "archived");
        }
        break;
      case "scheduled":
        if (type === "archive") {
          clearSchedule();
          handleInputChange("status", "archived");
        }
        break;
      case "running":
        if (type === "pause") {
          handleActiveChange(false, "paused");
          handleInputChange("status", "paused");
        } else if (type === "archive") {
          handleActiveChange(false, "archived");
          clearSchedule();
          handleInputChange("status", "archived");
        } else if (type === "schedule") {
          handleActiveChange(false, "scheduled")
          handleInputChange("status", "scheduled");
        }
        break;
      case "paused":
        if (type === "play") {
          handleInputChange("status", "running");
          handleActiveChange(true, "running")
        } else if (type === "archive") {
          clearSchedule()
          handleInputChange("status", "archived")
        }
        break;

      case "complete":
        if (type === "archive") {
          handleInputChange("status", "archived");
          clearSchedule();
        }
        break;

      case "pending":
        if (type === "archive") {
          handleInputChange("status", "archive");
          handleActiveChange(false, "archived");
          clearSchedule();
        }
        break;

      default:
        console.error(`Unhandled status: ${status}`);
    }
  };

  return (
    <div
      id="campaignSettingsContainer"
      className="flex h-full flex-col gap-4 p-4"
    >
      <SaveBar
        isChanged={isChanged}
        isSaving={formFetcher.state === 'submitting'}
        onSave={() => {
          formFetcher.submit(
            {
              campaignData: JSON.stringify({ ...campaignData, is_active: data.is_active }),
              campaignDetails: JSON.stringify(details),
            },
            {
              method: "patch",
              action: "/api/campaigns",
            }
          );
        }}
        onReset={() => {
          setCampaignData(initialData);
          setChanged(false);
        }}
      />
      <formFetcher.Form method="patch" action="/api/campaigns">
        <input
          type="hidden"
          name="campaignData"
          value={JSON.stringify({ ...campaignData, is_active: data.is_active })}
        />
        <input
          type="hidden"
          name="campaignDetails"
          value={JSON.stringify(details)}
        />
        <div className="flex flex-col gap-2">
          <CampaignBasicInfo
            campaignData={campaignData}
            handleInputChange={handleInputChange}
            handleButton={handleStatusButtons}
            phoneNumbers={phoneNumbers}
            flags={flags}
            joinDisabled={joinDisabled}
            formFetcher={formFetcher}
            details={details}
          />
          <CampaignTypeSpecificSettings
            campaignData={campaignData}
            handleInputChange={handleInputChange}
            mediaData={mediaData}
            scripts={scripts}
            handleActivateButton={handleActivateButton}
            handleScheduleButton={handleScheduleButton}
            details={details}
            mediaLinks={mediaLinks}
            isChanged={isChanged}
            isBusy={navigation.state !== "idle"}
            joinDisabled={joinDisabled}
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex flex-col gap-2">
            <AudienceSelection
              audiences={audiences}
              campaignData={campaignData}
              handleAudience={handleAudience}
            />
            </div>
            <div>
              <div className="mt-4 border rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex gap-4">
                    <div>
                      <span className="text-sm text-muted-foreground">Queued</span>
                      <p className="text-xl font-semibold">
                        {queueCount}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Total</span>
                      <p className="text-xl font-semibold">
                        {totalCount}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => navigate("../queue")}
                  >
                    Manage Queue
                  </Button>
                </div>

                <div className="rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="py-2 px-4 text-left">Name</th>
                        <th className="py-2 px-4 text-left">Phone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignQueue?.slice(0, 15).map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="py-2 px-4">{`${item.contact?.firstname} ${item.contact?.surname}` || '-'}</td>
                          <td className="py-2 px-4">{item.contact?.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {queueCount > 15 && (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      + {queueCount - 15} more contacts
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </formFetcher.Form>
    </div>
  );
};
