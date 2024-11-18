import { NavigateFunction } from "@remix-run/react";
import { Fetcher } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Audience, CampaignAudience, IVRCampaign, LiveCampaign, MessageCampaign, Schedule } from "~/lib/types";
import { deepEqual } from "~/lib/utils";

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
    script_id: number | null;
    audiences: Audience[];
    body_text: string;
    message_media: string[];
    voicedrop_audio: string | null;
    schedule: Schedule;
    is_active: boolean;
    campaign_audience?: CampaignAudience | null;
    details: LiveCampaign | MessageCampaign | IVRCampaign;
};

function isMessageCampaign(campaign: any): campaign is MessageCampaign {
    return campaign.type === 'message';
}

function isScriptBasedCampaign(campaign: any): campaign is LiveCampaign | IVRCampaign {
    return campaign.type === 'live_call' || campaign.type === 'robocall';
}

export default function useCampaignSettings(
    {
        campaign_id,
        workspace,
        title,
        status,
        type,
        dial_type,
        group_household_queue,
        start_date,
        end_date,
        caller_id,
        voicemail_file,
        script_id,
        audiences,
        body_text,
        message_media,
        voicedrop_audio,
        schedule,
        is_active,
        campaign_audience,
        fetcher,
        formFetcher,
        navigate,
        details
    }: CampaignSettingsData & { fetcher: Fetcher, formFetcher: Fetcher, navigate: NavigateFunction }
) {
    const [isChanged, setChanged] = useState(false);
    const [campaignData, setCampaignData] = useState<CampaignSettingsData>({
        campaign_id,
        workspace,
        title,
        status,
        type,
        dial_type,
        group_household_queue,
        start_date,
        end_date,
        caller_id,
        voicemail_file,
        script_id,
        audiences,
        body_text,
        message_media,
        voicedrop_audio,
        schedule,
        is_active,
        campaign_audience,
        details
    });
    const [initial, setInitial] = useState<CampaignSettingsData>(campaignData);

    const handleResetData = () => {
        setCampaignData(initial);
    }

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

    const handleScheduleButton = (event: React.FormEvent<HTMLFormElement> | null = null) => {
        if (event) {
            event.preventDefault();
        }
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

    const handleInputChange = (name: string, value: string | boolean | number | null | Schedule) => {
        setCampaignData((prev) => ({ ...prev, [name]: value }));
    };

    const handleAudienceChange = (audience: CampaignAudience | null, isChecked: boolean) => {
        setCampaignData((prev) => ({
            ...prev,
            audiences: isChecked
                ? [...prev.audiences, audience].filter((a): a is Audience => a !== null)
                : prev.audiences.filter((aud) => aud && aud.id !== audience?.audience_id),
        }));
    };

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
                    handleScheduleButton();
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

    const handleUpdateData = (campaignData: CampaignSettingsData) => {
        setCampaignData(campaignData);
        setInitial(campaignData);
        setChanged(!deepEqual(campaignData, initial));
    }

    useEffect(() => {
        setChanged(!deepEqual(campaignData, initial));
    }, [campaignData, initial]);


    return {
        isChanged,
        setChanged,
        campaignData,
        setCampaignData,
        handleInputChange,
        handleAudienceChange,
        handleActiveChange,
        handleScheduleButton,
        handleStatusButtons,
        handleResetData,
        handleUpdateData
    };
}