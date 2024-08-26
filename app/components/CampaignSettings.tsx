import { useState, useEffect, useMemo, FormEvent } from "react";
import { useNavigate, useNavigation, useFetcher, Form } from "@remix-run/react";
import { FileObject } from "@supabase/storage-js";
import { Button } from "./ui/button";
import { deepEqual } from "~/lib/utils";
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
import { User } from "@supabase/supabase-js";
import { CampaignBasicInfo } from "./CampaignBasicInfo";
import { CampaignTypeSpecificSettings } from "./CampaignDetailed";
import { AudienceSelection } from "./CampaignAudienceSelection";

type CampaignSettingsProps = {
  campaign_id: string;
  data: Campaign & { campaign_audience: CampaignAudience };
  audiences: Audience[];
  mediaData: FileObject[];
  workspace: string;
  phoneNumbers: WorkspaceNumbers[];
  campaignDetails:
    | (LiveCampaign & { script: Script })
    | (IVRCampaign & { script: Script })
    | MessageCampaign;
  scripts: Script[];
  user: User;
  mediaLinks: any[];
  onPageDataChange: (
    data: Campaign & { campaign_audience: CampaignAudience },
  ) => void;
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
    start_date: data?.start_date || "",
    end_date: data?.end_date || "",
    caller_id: data?.caller_id || "",
    voicemail_file: data?.voicemail_file || "",
    script_id: details?.script_id || null,
    audiences: data?.campaign_audience ? [...data.campaign_audience] : [],
    body_text: details?.body_text || "",
    message_media: details?.message_media || [],
  }));
  const [initialData, setInitial] = useState(campaignData);

  const [isChanged, setChanged] = useState(false);

  useEffect(() => {
    setInitial({
      campaign_id,
      workspace,
      title: data?.title || "",
      status: data?.status || "",
      type: data?.type || "live_call",
      dial_type: data?.dial_type || "call",
      group_household_queue: data?.group_household_queue || false,
      start_date: data?.start_date || "",
      end_date: data?.end_date || "",
      caller_id: data?.caller_id || "",
      voicemail_file: data?.voicemail_file || "",
      script_id: details?.script_id || null,
      audiences: data?.campaign_audience ? [...data.campaign_audience] : [],
      body_text: details?.body_text || "",
      message_media: details?.message_media || [],
    });
  }, [
    campaign_id,
    data,
    details?.body_text,
    details?.message_media,
    details?.script_id,
    workspace,
  ]);

  useEffect(() => {
    setChanged(!deepEqual(campaignData, initialData));
  }, [campaignData, initialData]);

  useEffect(() => {
    if (formFetcher.data) {
      onPageDataChange({
        ...campaignData,
        campaign_audience: campaignData.audiences,
      });
      setChanged(!deepEqual(campaignData, initialData));
    }
  }, [formFetcher.data]);

  const handleInputChange = (name, value) => {
    setCampaignData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAudience = (audience, isChecked) => {
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

  const handleActivateButton = (event) => {
    if (campaignData.type === "live_call") {
      handleInputChange("status", "running");
      formFetcher.submit(
        {
          campaignData: JSON.stringify({ ...campaignData, status: "running" }),
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
        { campaign_id, user_id: user },
        {
          method: "post",
          action: "/api/initiate-ivr",
          encType: "application/json",
        },
      );
      navigate("..");
    } else if (campaignData.type === "message") {
      handleInputChange("status", "running");
      fetcher.submit(
        {
          campaign_id,
          workspace_id: details.workspace,
          caller_id: campaignData.caller_id,
        },
        { method: "post", action: "/api/sms", encType: "application/json" },
      );
      navigate("../../chats");
    }
  };

  return (
    <div
      id="campaignSettingsContainer"
      className="flex h-full flex-col gap-4 p-4"
    >
      <formFetcher.Form method="patch" action="/api/campaigns">
        <input
          type="hidden"
          name="campaignData"
          value={JSON.stringify(campaignData)}
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
            phoneNumbers={phoneNumbers}
          />
          <CampaignTypeSpecificSettings
            campaignData={campaignData}
            handleInputChange={handleInputChange}
            mediaData={mediaData}
            scripts={scripts}
            handleActivateButton={handleActivateButton}
            details={details}
            mediaLinks={mediaLinks}
            isChanged={isChanged}
          />
          <AudienceSelection
            audiences={audiences}
            campaignData={campaignData}
            handleAudience={handleAudience}
          />
          <div className="mt-2 flex justify-end">
            <Button
              type="submit"
              className="text-xl font-semibold uppercase disabled:bg-zinc-400"
              disabled={navigation.state !== "idle" || !isChanged}
            >
              Save Settings
            </Button>
          </div>
        </div>
      </formFetcher.Form>
    </div>
  );
};
