import { NavigateFunction } from "@remix-run/react";
import { Fetcher, SubmitFunction } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Audience, CampaignAudience, Schedule, Script } from "~/lib/types";
import { deepEqual } from "~/lib/utils";
import { Tables, Database } from "~/lib/database.types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };
type LiveCampaign = Tables<"live_campaign"> & { script: Script };
type MessageCampaign = Tables<"message_campaign">;
type IVRCampaign = Tables<"ivr_campaign"> & { script: Script };



export type CampaignUIState = {
    isChanged: boolean;
    confirmStatus: "play" | "pause" | "archive" | "none";
    scheduleDisabled: string | boolean;
    joinDisabled: string | null;
};

export function useCampaignSettings({
    initialState,
    navigate,
    fetcher,
}: {
    initialState: CampaignState;
    navigate: NavigateFunction;
    fetcher: Fetcher<{success?: boolean, campaign?: Partial<CampaignState>, campaignDetails?: CampaignState['details']}> & { submit: SubmitFunction };
}) {
    const [state, setState] = useState<CampaignState>(initialState);
    const [uiState, setUIState] = useState<CampaignUIState>({
        isChanged: false,
        confirmStatus: "none",
        scheduleDisabled: false,
        joinDisabled: null,
    });

    useEffect(() => {
        if (!deepEqual(state, initialState)) {
            setUIState(prev => ({ ...prev, isChanged: true }));
        } else {
            setUIState(prev => ({ ...prev, isChanged: false }));
        }
    }, [state, initialState]);

    const updateCampaignField = (field: keyof CampaignState, value: any) => {
        setState(prev => ({
            ...prev,
            [field]: value,
        }));
    };

    const resetState = () => {
        setState(initialState);
        setUIState(prev => ({ ...prev, isChanged: false }));
    };

    const handleAudienceChange = (audience: NonNullable<CampaignAudience>, isChecked: boolean) => {
        if (!audience) return;
        const newAudiences = isChecked
            ? [...state.audiences, { id: audience.audience_id } as NonNullable<Audience>]
            : state.audiences.filter(a => a.id !== audience.audience_id);
        updateCampaignField("audiences", newAudiences);
    };

    const handleStatusButtons = (type: "play" | "pause" | "archive" | "schedule") => {
        if (type === "schedule") {
            navigate("schedule");
            return;
        }
        if (type === "pause") {
            const updatedState = {
                ...state,
                status: "paused",
                is_active: false
            };
            setState(updatedState);
            fetcher.submit(
                {
                    campaignData: JSON.stringify(updatedState),
                    campaignDetails: JSON.stringify(state.details),
                },
                { method: "patch", action: "/api/campaigns" }
            );
            setUIState(prev => ({ ...prev, confirmStatus: "none" }));
            return;
        }
        setUIState(prev => ({ ...prev, confirmStatus: type }));
    };

    const handleConfirmStatus = (status: "play" | "pause" | "archive" | "none") => {
        if (status === "none" && uiState.confirmStatus !== "none") {
            const newStatus = uiState.confirmStatus === "play" ? "running" :
                            uiState.confirmStatus === "archive" ? "archived" :
                            state.status;
            
            const updatedState = {
                ...state,
                status: newStatus,
                is_active: newStatus === "running"
            };

            setState(updatedState);
            fetcher.submit(
                {
                    campaignData: JSON.stringify(updatedState),
                    campaignDetails: JSON.stringify(state.details),
                },
                { method: "patch", action: "/api/campaigns" }
            );
        }
        setUIState(prev => ({ ...prev, confirmStatus: status }));
    };

    const handleSave = () => {
        fetcher.submit(
            {
                campaignData: JSON.stringify(state),
                campaignDetails: JSON.stringify(state.details),
            },
            { method: "patch", action: "/api/campaigns" }
        );
    };

    useEffect(() => {
        const data = fetcher.data;
        if (fetcher.state === 'idle' && data?.success && data.campaign && data.campaignDetails) {
            setUIState(prev => ({ ...prev, isChanged: false }));
            setState(prevState => ({
                ...prevState,
                ...(data.campaign as Partial<CampaignState>),
                details: data.campaignDetails as CampaignState['details']
            }));
        }
    }, [fetcher.state, fetcher.data]);

    return {
        state,
        uiState,
        updateCampaignField,
        resetState,
        handleAudienceChange,
        handleStatusButtons,
        handleConfirmStatus,
        handleSave,
    };
}