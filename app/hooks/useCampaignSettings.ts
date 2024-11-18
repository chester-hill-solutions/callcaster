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
        details,
    }: Omit<CampaignSettingsData, 'handleScheduleButton' | 'handleActiveChange'>
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
        details,
    });
    const [initial, setInitial] = useState<CampaignSettingsData>(campaignData);
    const handleResetData = () => {
        setCampaignData(initial);
    }

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

    const getScheduleData = () => {
        return {
            campaignData: JSON.stringify({ ...campaignData, status: "scheduled" }),
            campaignDetails: JSON.stringify(details),
        };
    };

    const getActiveChangeData = (isActive: boolean, status: string | null) => {
        return {
            campaignData: JSON.stringify({ ...campaignData, is_active: isActive, ...(status && { status }) }),
            campaignDetails: JSON.stringify(details),
        };
    };

    const handleStatusButtons = (
        type: "play" | "pause" | "archive" | "schedule",
    ) => {
        const status = campaignData.status;
        switch (status) {
            case "draft":
                if (type === "play") {
                    handleInputChange("status", "running");
                    handleInputChange("is_active", true);
                } else if (type === "schedule") {
                    handleInputChange("status", "scheduled");
                } else if (type === "archive") {
                    clearSchedule();
                    handleInputChange("status", "archived");
                    handleInputChange("is_active", false);
                }
                break;
            case "scheduled":
                if (type === "archive") {
                    clearSchedule();
                    handleInputChange("status", "archived");
                    handleInputChange("is_active", false);
                }
                if (type === "play") {
                    handleInputChange("status", "running");
                    handleInputChange("is_active", true);
                }
                break;
            case "running":
                if (type === "pause") {
                    handleInputChange("status", "paused");
                    handleInputChange("is_active", false);
                } else if (type === "archive") {
                    handleInputChange("status", "archived");
                    clearSchedule();
                } else if (type === "schedule") {
                    handleInputChange("status", "scheduled");
                    handleInputChange("is_active", false);
                }
                break;
            case "paused":
                if (type === "play") {
                    handleInputChange("status", "running");
                    handleInputChange("is_active", true);
                } else if (type === "archive") {
                    clearSchedule()
                    handleInputChange("status", "archived")
                    handleInputChange("is_active", false);
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
                    handleInputChange("is_active", false);
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
        handleStatusButtons,
        handleResetData,
        handleUpdateData,
        getScheduleData,
        getActiveChangeData
    };
}